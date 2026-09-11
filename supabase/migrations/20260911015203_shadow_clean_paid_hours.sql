-- ============================================================================
-- Shadow cleans are paid (BJ, 11 Sep 2026).
--
-- The trainee is not on the job, so they never clock on themselves. When the
-- supervisor clocks off, the trainee gets a time entry covering the same
-- clock-on to clock-off, unapproved, at their own hourly rate. It then goes
-- through Timesheets like any other entry: approve, or Edit hours if they
-- arrived late or left early.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

-- Links the booking to the hours it produced, so cancelling can remove them
-- and nothing is ever logged twice.
alter table public.staff_shadow_cleans
  add column if not exists time_entry_id uuid references public.time_entries(id) on delete set null;

-- Idempotent: safe to call any number of times for a job.
create or replace function public.log_shadow_clean_hours(p_job_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  j record;
  s record;
  existing uuid;
  created uuid;
  logged int := 0;
begin
  select id, clock_on, clock_off into j from public.jobs where id = p_job_id;
  if not found or j.clock_on is null or j.clock_off is null or j.clock_off <= j.clock_on then
    return 0;
  end if;

  for s in
    select id, trainee_id from public.staff_shadow_cleans
     where job_id = p_job_id and status <> 'cancelled' and time_entry_id is null
     for update
  loop
    -- Never double up if the trainee somehow already has hours on this job.
    select t.id into existing from public.time_entries t
     where t.job_id = p_job_id and t.user_id = s.trainee_id
     order by t.created_at limit 1;

    if existing is not null then
      update public.staff_shadow_cleans set time_entry_id = existing, updated_at = now() where id = s.id;
      continue;
    end if;

    insert into public.time_entries (job_id, user_id, clock_in_time, clock_out_time, total_minutes, geo_override)
    values (
      p_job_id, s.trainee_id, j.clock_on, j.clock_off,
      round(extract(epoch from (j.clock_off - j.clock_on)) / 60)::int,
      true
    )
    returning id into created;

    update public.staff_shadow_cleans set time_entry_id = created, updated_at = now() where id = s.id;
    logged := logged + 1;
  end loop;

  return logged;
end $$;

-- Only the database itself and the server may log hours for another person.
revoke all on function public.log_shadow_clean_hours(uuid) from public;
revoke execute on function public.log_shadow_clean_hours(uuid) from anon, authenticated;
grant execute on function public.log_shadow_clean_hours(uuid) to service_role;

-- Wrapped so a problem here can NEVER block a supervisor clocking off.
create or replace function public.trg_log_shadow_clean_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.log_shadow_clean_hours(new.id);
  exception when others then
    raise warning 'log_shadow_clean_hours failed for job %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.trg_log_shadow_clean_hours() from anon, authenticated;

drop trigger if exists shadow_clean_hours_on_clock_off on public.jobs;
create trigger shadow_clean_hours_on_clock_off
  after update of clock_off on public.jobs
  for each row
  when (new.clock_off is not null and new.clock_off is distinct from old.clock_off)
  execute function public.trg_log_shadow_clean_hours();
