-- ============================================================================
-- Shadow cleans
--
-- A trainee joins a real job run by an admin or head cleaner, who then rates
-- it out of 10 with an outcome (Pass, Needs more work, Fail) and notes. Rated
-- sessions fill Shadow Clean 1 and 2 in the trainee's training record and
-- drive the pre-start checklist and the deployment gate.
--
-- The trainee is NOT added to the job as a cleaner. That keeps acceptance SMS,
-- job status and timesheets untouched. The job's details are snapshotted onto
-- the row so a trainee can see where and when without job permissions.
--
-- Writes go only through the staff-onboarding edge function, which recomputes
-- the training record on every change. There are deliberately no write
-- policies here.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

create table if not exists public.staff_shadow_cleans (
  id               uuid primary key default gen_random_uuid(),
  trainee_id       uuid not null references auth.users(id) on delete cascade,
  trainee_name     text,
  supervisor_id    uuid references auth.users(id) on delete set null,
  supervisor_name  text,
  job_id           uuid references public.jobs(id) on delete set null,
  scheduled_date   date not null,
  scheduled_time   text,
  property_name    text,
  property_address text,
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'rated', 'cancelled')),
  rating           int check (rating between 0 and 10),
  outcome          text check (outcome in ('pass', 'needs_more_work', 'fail')),
  notes            text,
  rated_at         timestamptz,
  rated_by         uuid references auth.users(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint staff_shadow_cleans_rated_is_complete
    check (status <> 'rated' or (rating is not null and outcome is not null))
);

create index if not exists staff_shadow_cleans_trainee_idx on public.staff_shadow_cleans(trainee_id);
create index if not exists staff_shadow_cleans_job_idx     on public.staff_shadow_cleans(job_id);
-- One live booking per trainee per job. Partial, so a cancelled booking can be
-- re-made. Never used as an ON CONFLICT target (partial indexes can't be).
create unique index if not exists staff_shadow_cleans_one_live_per_job
  on public.staff_shadow_cleans(job_id, trainee_id) where status <> 'cancelled';

alter table public.staff_shadow_cleans enable row level security;

create policy "Admin or head cleaner read shadow cleans"
  on public.staff_shadow_cleans for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'head_cleaner'::app_role));

create policy "Trainee reads own shadow cleans"
  on public.staff_shadow_cleans for select to authenticated
  using (trainee_id = auth.uid());
