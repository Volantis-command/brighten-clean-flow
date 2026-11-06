-- A job must always know what kind of clean it is.
--
-- There are eleven places that create a job: six screens and five edge
-- functions (recurring top-up, the Hostaway webhook, intake, QC revisits,
-- job-completed rebooking). Patching all eleven and remembering every future
-- one is exactly how service_type ended up unpopulated for a year, so the
-- floor lives in the database instead.
--
-- Anything that sets service_type itself is left alone and counts as chosen by
-- a human. Anything that does not gets the standard clean for that property and
-- is flagged as a guess, so a report can always tell the two apart.
create or replace function fill_job_service_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ctype text;
begin
  if new.service_type is not null and btrim(new.service_type) <> '' then
    return new;  -- somebody chose it; never overwrite that
  end if;

  select client_type into ctype from properties where id = new.property_id;

  new.service_type := case when ctype = 'airbnb' then 'Turnover Clean' else 'House Clean' end;
  new.service_type_inferred := true;
  return new;
end;
$$;

drop trigger if exists trg_fill_job_service_type on jobs;
create trigger trg_fill_job_service_type
  before insert on jobs
  for each row execute function fill_job_service_type();

-- Verified on production 6 Nov 2026 with three throwaway rows, since deleted:
--   airbnb property, nothing set      -> Turnover Clean, flagged as a guess
--   residential property, nothing set -> House Clean, flagged as a guess
--   residential property, Deep Clean  -> Deep Clean, NOT flagged
