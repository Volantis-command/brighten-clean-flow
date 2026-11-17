// ============================================================================
// Answering on a cleaner's behalf.
//
// BJ, 18 Nov 2026: "i cant close this job off cause jess hasnt said yes, but
// she has done the job, i need to be able to override this".
//
// The offer is not the work. A cleaner who turned up and cleaned but never
// tapped the SMS leaves the job sitting amber forever, and nothing downstream
// — close off, the roster, the chase — can move.
//
// The record keeps the two facts apart. `overridden_by` means an admin said
// yes for them, which is a different thing to the cleaner saying yes, and the
// difference is what matters if the hours are ever argued about.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';

/** Mark one cleaner as accepted on this job, on their behalf. */
export async function markAcceptedByAdmin(jobId: string, cleanerId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const adminId = auth?.user?.id ?? null;
  const now = new Date().toISOString();

  const { data: existing, error: readErr } = await supabase
    .from('job_acceptances')
    .select('id')
    .eq('job_id', jobId)
    .eq('cleaner_id', cleanerId)
    .maybeSingle();
  if (readErr) throw new Error(`Could not read the offer: ${readErr.message}`);

  const row = {
    acceptance_status: 'accepted',
    responded_at: now,
    overridden_by: adminId,
    overridden_at: now,
  } as any;

  if (existing) {
    const { error } = await supabase.from('job_acceptances').update(row).eq('id', existing.id);
    if (error) throw new Error(`Could not mark it accepted: ${error.message}`);
  } else {
    // No offer was ever sent. Still a legitimate state: the cleaner was added
    // to the job by hand and just did it.
    const { error } = await supabase
      .from('job_acceptances')
      .insert({ job_id: jobId, cleaner_id: cleanerId, ...row });
    if (error) throw new Error(`Could not mark it accepted: ${error.message}`);
  }

  // Everyone on the job has now said yes (or been said yes for), so the job
  // itself is really booked. Without this the block stays amber even though
  // every band under it is green.
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('cleaner_1_id, cleaner_2_id, status')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) return;

  const team = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean).map(String);
  if (team.length === 0) return;

  const { data: all } = await supabase
    .from('job_acceptances')
    .select('cleaner_id, acceptance_status')
    .eq('job_id', jobId);
  const accepted = new Set(
    (all ?? [])
      .filter((a: any) => a.acceptance_status === 'accepted')
      .map((a: any) => String(a.cleaner_id)),
  );

  const stillOpen = job.status === 'pending_cleaner' || job.status === 'awaiting_cleaner_acceptance';
  if (stillOpen && team.every((id) => accepted.has(id))) {
    const { error } = await supabase.from('jobs').update({ status: 'confirmed' }).eq('id', jobId);
    if (error) throw new Error(`Marked accepted, but the job status did not move: ${error.message}`);
  }
}
