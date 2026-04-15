-- Defense-in-depth for the job status state machine (Fix 1).
--
-- Brendan reported that brand-new jobs are still showing as 'scheduled' (green)
-- in the UI instead of 'pending_cleaner' (yellow). Most code paths now use
-- initialJobStatusForAssignment(), but a DB trigger guarantees correctness
-- regardless of which path inserts the job (frontend, edge function, manual
-- SQL, future code, third-party integration).
--
-- Rules at INSERT time only (we never overwrite a status the app set
-- intentionally to in_progress / completed / etc):
--   * if status is null OR 'scheduled' (the legacy default):
--     - no cleaners assigned -> 'pending_cleaner'
--     - any cleaner assigned -> 'awaiting_cleaner_acceptance'
--
-- The trigger is INSERT-only on purpose. Status transitions after creation
-- are owned by the app (syncJobAssignment, acceptJob, declineJob).

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

COMMENT ON FUNCTION public.enforce_initial_job_status IS
  'Defense-in-depth for the canonical job lifecycle (see src/lib/jobAssignment.ts). '
  'Forces newly inserted jobs to the right yellow state if the caller used the '
  'legacy "scheduled" default. INSERT-only — does not interfere with later '
  'status changes owned by the application.';
