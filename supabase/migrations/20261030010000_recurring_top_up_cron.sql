-- ============================================================================
-- Nightly top up for recurring cleans (BJ, 30 Oct 2026).
--
-- Until now the ONLY thing that created the next clean was job-completed-sms,
-- firing on completion. A clean never marked done, a cancelled one, a property
-- with no client link or a client with no phone all ended the chain silently.
-- This runs every night at 8pm Gold Coast and refills every running series a
-- year ahead, working off the series instead of completions.
-- ============================================================================

do $$
declare j record;
begin
  for j in select jobid from cron.job where command ilike '%recurring-top-up%' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'recurring-top-up-daily',
  '0 10 * * *',
  $cron$
  select net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/recurring-top-up',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
