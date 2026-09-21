-- ============================================================================
-- Weekly invoicing on each client's own day (BJ, 21 Sep 2026).
--
-- Kingscliff Holiday Homes want one invoice a week covering Wed to Tue,
-- raised Tuesday night and paid Wednesday. Each weekly client now has:
--   invoice_week_ends_on  day their week ends, 0=Sun … 6=Sat (null = Sunday)
--   weekly_invoice_from   nothing before this date is ever put on a weekly
--                         invoice; completed cleans missed in an earlier week
--                         since then are swept onto the next one
--   invoice_due_days      days until due (null = 7)
--
-- The run moves from Monday 6am to every evening at 9pm Gold Coast time and
-- invoices whoever's week ends that day. The two identical Monday cron jobs
-- (both fired at once, so a weekly client could get two invoices) are replaced
-- by one.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

alter table public.profiles
  add column if not exists invoice_week_ends_on smallint
    check (invoice_week_ends_on between 0 and 6),
  add column if not exists weekly_invoice_from date,
  add column if not exists invoice_due_days smallint
    check (invoice_due_days between 0 and 90);

do $$
declare j record;
begin
  for j in select jobid from cron.job where command ilike '%xero-weekly-batch-invoice%' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- 11:00 UTC = 9pm AEST every day.
select cron.schedule(
  'weekly-invoice-daily-9pm',
  '0 11 * * *',
  $cron$
  select net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/xero-weekly-batch-invoice',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);

-- Kingscliff Holiday Homes: week Wed to Tue, invoiced Tuesday night, due
-- Wednesday. BJ invoiced Wed 16 to Tue 22 Sep by hand (INV-0083), so the first
-- automatic week is Wed 23 to Tue 29 Sep.
update public.profiles
   set invoice_week_ends_on = 2,
       weekly_invoice_from = date '2026-09-23',
       invoice_due_days = 1
 where id = '407387c4-ddc9-43bf-9a1a-ea8f22369a28';
