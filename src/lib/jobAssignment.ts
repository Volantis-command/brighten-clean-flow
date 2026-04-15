/**
 * Centralized helpers for the job assignment / acceptance state machine.
 *
 * Canonical flow (per Brightly spec):
 *   - Quote accepted, no cleaner  -> 'pending_cleaner' (🟡)
 *   - Cleaner assigned             -> 'awaiting_cleaner_acceptance' (🟡)
 *     + job_acceptances row per cleaner (status='pending')
 *     + SMS to each assigned cleaner
 *   - All cleaners accepted        -> 'confirmed' (🟢)
 *   - A cleaner declines           -> revert to 'pending_cleaner' (🟡)
 *                                     + admin alert
 *     - Re-assign clears declined cleaner's row
 *   - Clocked in                   -> 'in_progress' (existing)
 *   - Completion submitted         -> 'completed' (existing)
 *
 * Edit rule: if date or assigned cleaners change on a 'confirmed' job,
 * acceptances reset and status returns to 'awaiting_cleaner_acceptance'
 * (or 'pending_cleaner' if cleaner was removed).
 *
 * Callers should:
 *   1. Update jobs.cleaner_1_id / cleaner_2_id first.
 *   2. Then call syncJobAssignment(jobId).
 *
 * For cleaner-initiated accept/decline, use acceptJob / declineJob.
 */

import { supabase } from '@/integrations/supabase/client';
import { createAlert, createAlertForUser } from '@/lib/alerts';

export type JobStatus =
  | 'scheduled'
  | 'pending_cleaner'
  | 'awaiting_cleaner_acceptance'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'flagged'
  | 'cancelled'
  | 'awaiting_quote'
  | 'pending';

/** Statuses we should NOT overwrite when re-syncing assignment. */
const LOCKED_STATUSES: JobStatus[] = [
  'in_progress',
  'completed',
  'cancelled',
  'flagged',
  'awaiting_quote',
];

interface SyncOptions {
  /** Send SMS to newly-assigned cleaners. Default true. */
  sendSms?: boolean;
  /** Force status reset even if all cleaners had previously accepted. Used when date/time changed. */
  forceReaccept?: boolean;
}

/**
 * Reconcile job.status and job_acceptances rows with the current cleaner_1_id / cleaner_2_id
 * values on the jobs row. Call this AFTER updating cleaner assignment on the job.
 */
export async function syncJobAssignment(
  jobId: string,
  opts: SyncOptions = {}
): Promise<void> {
  const { sendSms = true, forceReaccept = false } = opts;

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, status, cleaner_1_id, cleaner_2_id')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    console.error('[jobAssignment] Failed to load job', jobId, jobErr);
    return;
  }

  // Never overwrite terminal / in-flight statuses.
  if (LOCKED_STATUSES.includes(job.status as JobStatus)) return;

  const assignedCleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean) as string[];

  // Load existing acceptances
  const { data: existing } = await supabase
    .from('job_acceptances')
    .select('id, cleaner_id, acceptance_status')
    .eq('job_id', jobId);

  const existingMap = new Map((existing || []).map((r) => [r.cleaner_id, r]));

  // 1. Remove acceptance rows for cleaners no longer assigned
  const staleIds = (existing || [])
    .filter((r) => !assignedCleanerIds.includes(r.cleaner_id))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await supabase.from('job_acceptances').delete().in('id', staleIds);
  }

  // 2. Insert pending rows for newly assigned cleaners; reset existing to pending if forceReaccept
  const now = new Date().toISOString();
  const newCleanerIds: string[] = [];
  for (const cleanerId of assignedCleanerIds) {
    if (!existingMap.has(cleanerId)) {
      await supabase.from('job_acceptances').insert({
        job_id: jobId,
        cleaner_id: cleanerId,
        acceptance_status: 'pending',
        sms_sent_at: sendSms ? now : null,
      } as any);
      newCleanerIds.push(cleanerId);
    } else if (forceReaccept) {
      const row = existingMap.get(cleanerId)!;
      await supabase
        .from('job_acceptances')
        .update({
          acceptance_status: 'pending',
          responded_at: null,
          sms_sent_at: sendSms ? now : null,
        } as any)
        .eq('id', row.id);
      newCleanerIds.push(cleanerId);
    }
  }

  // 3. Compute new status
  let newStatus: JobStatus;
  if (assignedCleanerIds.length === 0) {
    newStatus = 'pending_cleaner';
  } else {
    // Check if every assigned cleaner has already accepted (and not forced to re-accept)
    const allAccepted =
      !forceReaccept &&
      assignedCleanerIds.every((cid) => existingMap.get(cid)?.acceptance_status === 'accepted');
    newStatus = allAccepted ? 'confirmed' : 'awaiting_cleaner_acceptance';
  }

  if (newStatus !== job.status) {
    await supabase.from('jobs').update({ status: newStatus } as any).eq('id', jobId);
  }

  // 4. Notify newly assigned cleaners (in-app alert + SMS)
  if (newCleanerIds.length > 0) {
    // Load property name + date for the notification body
    const { data: jobMeta } = await supabase
      .from('jobs')
      .select('scheduled_date, scheduled_time, properties(property_name)')
      .eq('id', jobId)
      .single();

    const propName = (jobMeta as any)?.properties?.property_name || 'a property';
    const when = jobMeta?.scheduled_date
      ? `${jobMeta.scheduled_date}${jobMeta.scheduled_time ? ' ' + jobMeta.scheduled_time.slice(0, 5) : ''}`
      : 'soon';

    for (const cleanerId of newCleanerIds) {
      try {
        await createAlertForUser(cleanerId, {
          event_type: 'job_assigned',
          title: 'New Job Offer',
          body: `You've been assigned ${propName} on ${when}. Tap to accept or decline.`,
          metadata: { job_id: jobId },
          link: `/my-jobs?offer=${jobId}`,
        });
      } catch (err) {
        console.error('[jobAssignment] createAlertForUser failed', err);
      }
    }

    if (sendSms) {
      try {
        // send-job-sms targets the current cleaner_1_id / cleaner_2_id on the job.
        await supabase.functions.invoke('send-job-sms', { body: { job_id: jobId } });
      } catch (err) {
        console.error('[jobAssignment] send-job-sms failed', err);
      }
    }
  }
}

/**
 * Cleaner accepts a job. If every assigned cleaner has now accepted,
 * the job transitions to 'confirmed' (green).
 */
export async function acceptJob(jobId: string, cleanerId: string): Promise<{ confirmed: boolean }> {
  const { error: accErr } = await supabase
    .from('job_acceptances')
    .update({
      acceptance_status: 'accepted',
      responded_at: new Date().toISOString(),
    } as any)
    .eq('job_id', jobId)
    .eq('cleaner_id', cleanerId);

  if (accErr) {
    console.error('[jobAssignment] acceptJob update failed', accErr);
    throw accErr;
  }

  // Check if all assigned cleaners have now accepted
  const { data: job } = await supabase
    .from('jobs')
    .select('cleaner_1_id, cleaner_2_id, status, properties(property_name)')
    .eq('id', jobId)
    .single();

  if (!job) return { confirmed: false };

  const assignedIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean) as string[];
  const { data: acceptances } = await supabase
    .from('job_acceptances')
    .select('cleaner_id, acceptance_status')
    .eq('job_id', jobId)
    .in('cleaner_id', assignedIds);

  const allAccepted =
    assignedIds.length > 0 &&
    assignedIds.every(
      (cid) =>
        (acceptances || []).find((a) => a.cleaner_id === cid)?.acceptance_status === 'accepted'
    );

  if (allAccepted && job.status === 'awaiting_cleaner_acceptance') {
    await supabase.from('jobs').update({ status: 'confirmed' } as any).eq('id', jobId);

    const propName = (job as any).properties?.property_name || 'a property';
    try {
      await createAlert({
        event_type: 'job_confirmed',
        title: 'Job Confirmed',
        body: `All cleaners have accepted the job at ${propName}.`,
        metadata: { job_id: jobId },
        target_role: 'admin',
        link: `/jobs/${jobId}`,
      });
    } catch (err) {
      console.error('[jobAssignment] createAlert (confirmed) failed', err);
    }

    return { confirmed: true };
  }

  return { confirmed: false };
}

/**
 * Cleaner declines a job. Removes them from the job, reverts status to
 * pending_cleaner (so admin can reassign), and alerts admin.
 */
export async function declineJob(
  jobId: string,
  cleanerId: string,
  reason?: string
): Promise<void> {
  // Record the decline on the acceptance row
  await supabase
    .from('job_acceptances')
    .update({
      acceptance_status: 'declined',
      responded_at: new Date().toISOString(),
    } as any)
    .eq('job_id', jobId)
    .eq('cleaner_id', cleanerId);

  // Remove from the job's cleaner slot(s)
  const { data: job } = await supabase
    .from('jobs')
    .select('cleaner_1_id, cleaner_2_id, scheduled_date, properties(property_name)')
    .eq('id', jobId)
    .single();

  if (!job) return;

  const update: Record<string, any> = {};
  if (job.cleaner_1_id === cleanerId) update.cleaner_1_id = null;
  if (job.cleaner_2_id === cleanerId) update.cleaner_2_id = null;

  // If both cleaner slots are now empty -> pending_cleaner. Otherwise leave status alone
  // (the remaining cleaner may still be awaiting_cleaner_acceptance or already accepted).
  const remainingCleaners = [
    update.cleaner_1_id === undefined ? job.cleaner_1_id : update.cleaner_1_id,
    update.cleaner_2_id === undefined ? job.cleaner_2_id : update.cleaner_2_id,
  ].filter(Boolean);

  if (remainingCleaners.length === 0) {
    update.status = 'pending_cleaner';
  }

  if (Object.keys(update).length > 0) {
    await supabase.from('jobs').update(update as any).eq('id', jobId);
  }

  // Also remove the declined cleaner's acceptance row so they can be re-assigned later cleanly
  await supabase
    .from('job_acceptances')
    .delete()
    .eq('job_id', jobId)
    .eq('cleaner_id', cleanerId);

  // Alert admin — per Brendan's call: every decline is alerted for now
  const propName = (job as any).properties?.property_name || 'a property';
  try {
    await createAlert({
      event_type: 'job_declined',
      title: 'Cleaner Declined Job',
      body: `A cleaner declined the job at ${propName} on ${job.scheduled_date}.${
        reason ? ` Reason: ${reason}` : ''
      } Please reassign.`,
      metadata: { job_id: jobId, cleaner_id: cleanerId, reason: reason || null },
      target_role: 'admin',
      link: `/jobs/${jobId}`,
    });
  } catch (err) {
    console.error('[jobAssignment] createAlert (declined) failed', err);
  }
}

/**
 * Returns the initial status that should be set on a newly-created job,
 * based on whether cleaners are assigned at creation time.
 * Use this at insert time so the row is born in the right state.
 */
export function initialJobStatusForAssignment(
  cleaner1Id: string | null | undefined,
  cleaner2Id: string | null | undefined
): JobStatus {
  const hasCleaner = Boolean(cleaner1Id) || Boolean(cleaner2Id);
  return hasCleaner ? 'awaiting_cleaner_acceptance' : 'pending_cleaner';
}
