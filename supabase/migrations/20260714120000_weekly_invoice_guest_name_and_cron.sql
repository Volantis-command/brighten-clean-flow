-- Weekly consolidated invoicing — guest name on jobs + the Monday cron.
--
-- BnB Hub asked for one weekly invoice (Mon–Sun) with a line per clean,
-- described as "Date — Property — Guest". This adds the guest_name field the
-- line needs, backfills it from existing job notes, and schedules the weekly
-- batch to run every Monday so a draft is waiting for review + send in Xero.

-- 1. Guest name column (populated at creation by the sync/booking flows).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS guest_name text;

-- 2. Backfill from existing notes. Two formats seen in the wild:
--    "Hostaway turnover — NAME\n<channel>…"   and   "Guest: NAME"
UPDATE public.jobs
SET guest_name = trim(substring(split_part(notes, E'\n', 1) from '(?:turnover|clean)\s+[—-]\s+(.+)$'))
WHERE guest_name IS NULL
  AND notes ~* '(?:turnover|clean)\s+[—-]\s+.+';

UPDATE public.jobs
SET guest_name = trim(substring(split_part(notes, E'\n', 1) from 'guest:\s*(.+)$'))
WHERE guest_name IS NULL
  AND notes ~* 'guest:\s*.+';

-- 3. Schedule the weekly batch every Monday at 06:00 Gold Coast time (AEST,
--    UTC+10, no DST) = 20:00 UTC on Sunday. The function's lastWeekRange() is
--    AEST-aware, so even though the cron fires while the UTC clock still reads
--    Sunday, it correctly bills the Mon–Sun week that just ended.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-batch-invoice-monday');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'weekly-batch-invoice-monday',
  '0 20 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/xero-weekly-batch-invoice',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
