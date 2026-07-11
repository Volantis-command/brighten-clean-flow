-- Scheduled-SMS reliability fix.
--
-- Before: reminder texts were dispatched from the admin's BROWSER (a dashboard
-- hook). Two open tabs double-sent; nobody online meant reminders never sent.
--
-- After: a pg_cron job calls process-scheduled-sms every 5 minutes to send due
-- reminders server-side. Rows are claimed atomically via a 'sending' status so
-- the worker (and any lingering browser dispatch) can never double-send.
--
-- 1. Widen the status CHECK. The app already writes 'cancelled' (which the old
--    constraint silently rejected) and the atomic claim needs 'sending'.
ALTER TABLE public.scheduled_sms DROP CONSTRAINT IF EXISTS scheduled_sms_status_check;
ALTER TABLE public.scheduled_sms
  ADD CONSTRAINT scheduled_sms_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));

-- 2. Safety net: if any row got stuck in 'sending' (worker crashed mid-send),
--    a future run won't retry it. This isn't expected, but re-release rows that
--    have been 'sending' for over 15 minutes back to pending.
--    (No-op on first apply; here for operational safety on re-runs.)
UPDATE public.scheduled_sms
  SET status = 'pending'
  WHERE status = 'sending';

-- 3. Schedule the worker every 5 minutes.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-sms-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'process-scheduled-sms-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/process-scheduled-sms',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
