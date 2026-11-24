-- Confirm a job the moment every cleaner on it has accepted.
--
-- 24 Nov 2026: Salty and Elliston sat amber all morning with Jess and Sikari
-- both showing "accepted". The in-app Accept button (src/lib/jobAssignment.ts)
-- decided "has everyone said yes?" from the cleaner's phone, and RLS on
-- job_acceptances only lets a cleaner read THEIR OWN row. So whoever accepted
-- second could never see the first cleaner's yes, concluded "no", and never
-- confirmed. Every two-cleaner job accepted that way stayed amber until an
-- admin overrode it. One-cleaner jobs were unaffected, which is why it hid.
--
-- The decision belongs here, where every row is visible and every way of
-- accepting goes through: the in-app button, the roster link, an SMS reply
-- and an admin override all write job_acceptances, and none of them can now
-- forget to move the job.
--
-- Only awaiting_cleaner_acceptance -> confirmed, the same move the app code
-- makes. A job in any other state is left exactly as it is.

create or replace function public.confirm_job_when_all_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
begin
  if NEW.acceptance_status is distinct from 'accepted' then
    return NEW;
  end if;

  select id, status, cleaner_1_id, cleaner_2_id into j
  from jobs where id = NEW.job_id;

  if not found
     or j.status <> 'awaiting_cleaner_acceptance'
     or (j.cleaner_1_id is null and j.cleaner_2_id is null) then
    return NEW;
  end if;

  -- Anyone assigned who has not accepted keeps the job open.
  if exists (
    select 1
    from (values (j.cleaner_1_id), (j.cleaner_2_id)) as team(cid)
    where team.cid is not null
      and not exists (
        select 1 from job_acceptances a
        where a.job_id = j.id
          and a.cleaner_id = team.cid
          and a.acceptance_status = 'accepted'
      )
  ) then
    return NEW;
  end if;

  update jobs set status = 'confirmed'
  where id = j.id and status = 'awaiting_cleaner_acceptance';

  return NEW;
end;
$$;

drop trigger if exists trg_confirm_job_when_all_accepted on public.job_acceptances;
create trigger trg_confirm_job_when_all_accepted
  after insert or update of acceptance_status on public.job_acceptances
  for each row execute function public.confirm_job_when_all_accepted();

-- Jobs already stuck: every assigned cleaner accepted, job never moved.
update jobs j set status = 'confirmed'
where j.status = 'awaiting_cleaner_acceptance'
  and (j.cleaner_1_id is not null or j.cleaner_2_id is not null)
  and not exists (
    select 1
    from (values (j.cleaner_1_id), (j.cleaner_2_id)) as team(cid)
    where team.cid is not null
      and not exists (
        select 1 from job_acceptances a
        where a.job_id = j.id and a.cleaner_id = team.cid and a.acceptance_status = 'accepted'
      )
  );
