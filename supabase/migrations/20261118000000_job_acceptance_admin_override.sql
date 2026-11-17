-- A cleaner did the job but never pressed accept.
-- Admin can answer on their behalf, but the record has to say so: "Jess
-- accepted" and "BJ marked Jess as accepted" are different facts, and only
-- one of them is evidence if the hours are ever disputed.
alter table public.job_acceptances
  add column if not exists overridden_by uuid references auth.users(id) on delete set null,
  add column if not exists overridden_at timestamptz;

comment on column public.job_acceptances.overridden_by is
  'Admin who answered on the cleaner''s behalf. Null means the cleaner answered themselves.';
