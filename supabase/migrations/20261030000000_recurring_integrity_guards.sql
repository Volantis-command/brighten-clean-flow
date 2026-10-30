-- ============================================================================
-- Recurring cleans, made safe (BJ, 30 Oct 2026).
--
-- Audit found: 293 of 318 jobs in a series were stamped 'one-off', so anything
-- asking "is this recurring?" was told no; the unique index meant to stop two
-- cleans on one date listed a status that does not exist; nothing closed a
-- series, so a cancelled one could rebuild itself; and Jade had two identical
-- series created 79 seconds apart.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

update public.job_series s
   set end_date = current_date - 1
 where (s.end_date is null or s.end_date > current_date - 1)
   and not exists (
     select 1 from public.jobs j
      where j.series_id = s.id and j.scheduled_date > current_date and j.status <> 'cancelled'
   );

update public.jobs j
   set frequency = s.frequency
  from public.job_series s
 where s.id = j.series_id
   and lower(coalesce(j.frequency, '')) is distinct from lower(s.frequency);

drop index if exists public.uniq_jobs_series_date_live;
create unique index uniq_jobs_series_date_live
  on public.jobs (series_id, scheduled_date)
  where series_id is not null
    and status in ('pending_cleaner', 'awaiting_cleaner_acceptance', 'scheduled', 'confirmed', 'in_progress');

create unique index if not exists uniq_job_series_open_per_property
  on public.job_series (property_id, frequency)
  where end_date is null;

alter table public.job_series
  add constraint job_series_interval_positive check (interval_weeks > 0) not valid,
  add constraint job_series_end_after_start check (end_date is null or end_date >= start_date) not valid;
