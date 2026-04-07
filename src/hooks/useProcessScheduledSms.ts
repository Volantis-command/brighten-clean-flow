import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that processes pending scheduled SMS records on dashboard mount.
 * Queries scheduled_sms WHERE send_at <= now() AND status = 'pending',
 * sends each via Twilio edge function, and updates status.
 */
export function useProcessScheduledSms() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function processPending() {
      try {
        const { data: pending, error } = await supabase
          .from('scheduled_sms' as any)
          .select('*')
          .eq('status', 'pending')
          .lte('send_at', new Date().toISOString())
          .order('send_at', { ascending: true })
          .limit(20);

        if (error || !pending?.length) return;

        for (const sms of pending as any[]) {
          if (!sms.recipient_phone || !sms.message) {
            await supabase
              .from('scheduled_sms' as any)
              .update({ status: 'failed', error: 'Missing phone or message' } as any)
              .eq('id', sms.id);
            continue;
          }

          // Skip SMS for cancelled jobs
          if (sms.job_id) {
            const { data: jobRow } = await supabase
              .from('jobs')
              .select('status')
              .eq('id', sms.job_id)
              .maybeSingle();
            if (jobRow?.status === 'cancelled') {
              await supabase
                .from('scheduled_sms' as any)
                .update({ status: 'cancelled', error: 'Job was cancelled' } as any)
                .eq('id', sms.id);
              continue;
            }
          }

          try {
            const { error: sendError } = await supabase.functions.invoke('send-job-sms', {
              body: { to: sms.recipient_phone, message: sms.message },
            });

            if (sendError) throw sendError;

            await supabase
              .from('scheduled_sms' as any)
              .update({ status: 'sent', sent_at: new Date().toISOString() } as any)
              .eq('id', sms.id);
          } catch (err: any) {
            await supabase
              .from('scheduled_sms' as any)
              .update({ status: 'failed', error: err.message || 'Send failed' } as any)
              .eq('id', sms.id);
          }
        }
      } catch {
        // Silent fail — don't block dashboard
      }
    }

    processPending();
  }, []);
}

/**
 * Schedule reminder SMS records when a job is confirmed.
 * Call this after a job is scheduled/accepted.
 */
export async function scheduleJobSmsReminders(job: {
  id: string;
  scheduled_date: string;
  scheduled_time?: string | null;
  clean_type?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  cleaner_name?: string | null;
  cleaner_phone?: string | null;
  property_address?: string | null;
}) {
  const records: any[] = [];
  const jobDate = new Date(`${job.scheduled_date}T${job.scheduled_time || '09:00'}:00`);
  const clientFirst = (job.client_name || 'there').split(' ')[0];
  const cleanerFirst = (job.cleaner_name || 'Team member').split(' ')[0];
  const cleanType = job.clean_type || 'clean';

  // 1. Client reminder: 24hrs before
  if (job.client_phone) {
    const sendAt = new Date(jobDate.getTime() - 24 * 60 * 60 * 1000);
    const timeStr = job.scheduled_time ? job.scheduled_time.slice(0, 5) : 'morning';
    records.push({
      job_id: job.id,
      recipient_type: 'client',
      recipient_phone: job.client_phone,
      message: `Hi ${clientFirst}, reminder: your ${cleanType} is tomorrow at ${timeStr}. ${cleanerFirst} will be your cleaner. 🌿 — Brightly`,
      send_at: sendAt.toISOString(),
      status: 'pending',
    });
  }

  // 2. Cleaner reminder: day of clean at 7am AEST
  if (job.cleaner_phone) {
    const cleanerSendAt = new Date(`${job.scheduled_date}T07:00:00+10:00`);
    const timeStr = job.scheduled_time ? job.scheduled_time.slice(0, 5) : 'scheduled time';
    records.push({
      job_id: job.id,
      recipient_type: 'cleaner',
      recipient_phone: job.cleaner_phone,
      message: `Hi ${cleanerFirst}, you have a ${cleanType} today at ${timeStr}: ${job.property_address || 'See app for details'}. See you there! — Brightly 🌿`,
      send_at: cleanerSendAt.toISOString(),
      status: 'pending',
    });
  }

  if (records.length > 0) {
    await supabase.from('scheduled_sms' as any).insert(records);
  }
}

/**
 * Schedule a review request SMS for 24hrs after job completion.
 */
export async function scheduleReviewSms(job: {
  id: string;
  client_name?: string | null;
  client_phone?: string | null;
}, completionTime?: Date) {
  if (!job.client_phone) return;

  const sendAt = new Date((completionTime || new Date()).getTime() + 24 * 60 * 60 * 1000);
  const clientFirst = (job.client_name || 'there').split(' ')[0];

  await supabase.from('scheduled_sms' as any).insert({
    job_id: job.id,
    recipient_type: 'client',
    recipient_phone: job.client_phone,
    message: `Hi ${clientFirst}, how did your clean go? We'd love your feedback: Reply 1-5 to rate us ⭐ — Brightly 🌿`,
    send_at: sendAt.toISOString(),
    status: 'pending',
  });
}
