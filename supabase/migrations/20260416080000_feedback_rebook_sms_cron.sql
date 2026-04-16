-- Schedule the feedback + rebook SMS function to run daily.
--
-- The `send-review-rebook-sms` edge function was already written (it's designed
-- to run once a day: look up jobs completed yesterday that pass QC, SMS the
-- client asking for feedback + a rebook nudge for one-off jobs). But nothing
-- was actually triggering it — feedback SMSes were silently never sent, and
-- clients never got the "thanks for choosing us, care to rebook?" follow up.
--
-- Schedule: daily at 23:00 UTC, which is 09:00 the next day in Brisbane
-- (AEST, UTC+10, no DST). Equates to a 9am-local SMS after a job the day
-- before.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('feedback-rebook-sms-daily');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not previously scheduled, ignore
END $$;

SELECT cron.schedule(
  'feedback-rebook-sms-daily',
  '0 23 * * *',  -- 23:00 UTC = 09:00 AEST next day
  $$
  SELECT net.http_post(
    url := 'https://mkknrxoqturkmpcmhvtt.supabase.co/functions/v1/send-review-rebook-sms',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
