-- Ensure the jobs.status CHECK constraint includes ALL canonical statuses.
--
-- This is an idempotent re-application of the constraint from the earlier
-- migration 20260415120000. Lovable may not have applied it, causing
-- "violates check constraint 'jobs_status_check'" errors when
-- ScheduleAfterAcceptModal tries to insert a job.
--
-- Safe to run multiple times: drops if exists, then creates.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (
  status = ANY (ARRAY[
    'scheduled',                    -- legacy green
    'pending_cleaner',              -- yellow, needs cleaner assignment
    'awaiting_cleaner_acceptance',  -- yellow, cleaner assigned, awaiting response
    'confirmed',                    -- green, cleaner accepted
    'in_progress',                  -- blue, cleaner clocked in
    'completed',                    -- gray, finished
    'flagged',                      -- red, issue
    'cancelled',                    -- red, cancelled
    'awaiting_quote',               -- yellow, no price yet
    'pending'                       -- legacy
  ])
);
