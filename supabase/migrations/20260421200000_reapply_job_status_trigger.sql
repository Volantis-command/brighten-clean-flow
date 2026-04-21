-- Re-apply the enforce_initial_job_status trigger.
--
-- The original migration (20260415160000_enforce_job_status_state_machine.sql)
-- existed in the repo before Lovable was connected and never actually ran
-- against production. The smoke test caught this on 2026-04-21 — inserting a
-- job with status='scheduled' and no cleaners left it as 'scheduled' instead
-- of auto-converting to 'pending_cleaner'.
--
-- This migration is identical to the original, just re-dated so Lovable
-- applies it on next publish. Fully idempotent (DROP + CREATE).

CREATE OR REPLACE FUNCTION public.enforce_initial_job_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only re-derive when the caller used the legacy default or didn't set one.
  IF NEW.status IS NULL OR NEW.status = 'scheduled' THEN
    IF NEW.cleaner_1_id IS NOT NULL OR NEW.cleaner_2_id IS NOT NULL THEN
      NEW.status := 'awaiting_cleaner_acceptance';
    ELSE
      NEW.status := 'pending_cleaner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_enforce_initial_status ON public.jobs;

CREATE TRIGGER trg_jobs_enforce_initial_status
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_initial_job_status();
