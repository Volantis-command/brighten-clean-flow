-- Fix the daily review/rebook SMS cron URL post-migration.
--
-- The original migration 20260416080000_feedback_rebook_sms_cron.sql
-- scheduled a daily 23:00 UTC pg_cron job that POSTs to:
--   https://mkknrxoqturkmpcmhvtt.supabase.co/functions/v1/send-review-rebook-sms
-- That URL was Lovable Cloud's Supabase project. After the 2026-04-25
-- migration to the owned Sydney Supabase (ueomxjsqvmbjfufjauhe), that
-- URL is dead — every nightly run since cutover has been hitting nothing.
-- Result: ~9 days of completed cleans with no review-and-rebook SMS sent.
--
-- This migration unschedules the broken job and re-schedules it with
-- the correct Sydney URL. Idempotent (safe to re-run).
--
-- Same pattern as 20260426180000_fix_xero_cron_url.sql which fixed the
-- equivalent Xero invoice sync cron.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('feedback-rebook-sms-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'feedback-rebook-sms-daily',
  '0 23 * * *',  -- 23:00 UTC = 09:00 AEST next day
  $$
  SELECT net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/send-review-rebook-sms',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
