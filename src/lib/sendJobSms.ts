/**
 * Wrapper around the `send-job-sms` edge function.
 *
 * Why this exists:
 * Until 2026-05-03, send-job-sms was a public function (`verify_jwt = false`)
 * that anyone with the URL could POST `{ to, message }` to and burn our
 * Twilio balance. Two pages (StaffOnboardingPage, CleanerPortalPage) call
 * it from public token-based contexts — they don't have a Supabase JWT —
 * so we can't just flip verify_jwt on.
 *
 * Defence: a shared secret header. Not NSA-grade — the value lives in the
 * browser bundle as a Vite env var — but enough to defeat the casual scanner
 * who pings every Supabase function URL hoping for one with no auth.
 *
 * Rollout safety: if SEND_JOB_SMS_SECRET is not set on the function side,
 * the function fails open (current behaviour). Once both VITE_SEND_JOB_SMS_SECRET
 * is set in Vercel AND SEND_JOB_SMS_SECRET is set in Supabase function
 * secrets to the same value, lockdown is active.
 *
 * Every send-job-sms call in the app should go through this helper. If you
 * see `supabase.functions.invoke('send-job-sms', ...)` anywhere else, fix it.
 */

import { supabase } from '@/integrations/supabase/client';

// Accepts either { job_id } (function looks up cleaner phones from DB) or
// { to, message } (direct SMS to a specific number, or 'ADMIN' for the
// configured admin phone). A few call sites pass both — the function
// prefers `to + message` when present, ignoring job_id. Kept loose so this
// PR doesn't have to refactor every unrelated call shape at the same time.
type SendJobSmsBody = {
  job_id?: string;
  to?: string;
  message?: string;
};

export function sendJobSms(body: SendJobSmsBody) {
  return supabase.functions.invoke('send-job-sms', {
    body,
    headers: {
      'x-brightly-secret': import.meta.env.VITE_SEND_JOB_SMS_SECRET || '',
    },
  });
}
