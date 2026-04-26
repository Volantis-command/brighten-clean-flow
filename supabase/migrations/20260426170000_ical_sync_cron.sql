-- Schedule sync-property-ical to run every 4 hours.
--
-- The sync edge function pulls iCal feeds from properties.ical_url for
-- every property that has one set, parses upcoming reservation dates,
-- and creates booking_suggestions for each future checkout. Admin
-- approves them in /bookings/suggestions.
--
-- This is the missing cron piece for non-PMS Airbnb hosts (Brendan's
-- 1-property test client use case 2026-04-26): they share an Airbnb
-- iCal URL once, admin pastes it on the property passport, this cron
-- pulls fresh bookings every 4 hours.
--
-- Why every 4 hrs (not 15 min like Xero):
-- - iCal feeds change slowly (hosts update Airbnb a few times/week)
-- - Hostaway clients use the webhook path, not iCal — only solo hosts
--   on the iCal path
-- - Airbnb rate-limits iCal exports; respect that
-- - 4 hrs gives admin enough notice for a next-day clean
--
-- The function is registered in supabase/config.toml with
-- verify_jwt = false so net.http_post can call it without an auth header.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('ical-sync-4hr');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'ical-sync-4hr',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/sync-property-ical',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
