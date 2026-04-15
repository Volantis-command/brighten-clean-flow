-- Fix 1: Job status state machine
--
-- Adds the two "yellow" states required by the canonical flow:
--   pending_cleaner           -- customer accepted, no cleaner assigned yet
--   awaiting_cleaner_acceptance -- cleaner assigned, waiting on their accept/decline
--
-- Also normalises the historical 'complete' status to 'completed'
-- (the DB enum accepted both; code inconsistently used either).
--
-- Existing rows with status='scheduled' are left as-is per Brendan's call
-- (option A on the historical-rows question — no back-migration drama).

-- 1. Normalise historical 'complete' rows to 'completed'
UPDATE public.jobs
SET status = 'completed'
WHERE status = 'complete';

-- 2. Replace the CHECK constraint with the new canonical set
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (
  status = ANY (ARRAY[
    'scheduled',                    -- legacy / pre-fix jobs; treated as green
    'pending_cleaner',              -- NEW: yellow, needs cleaner assignment
    'awaiting_cleaner_acceptance',  -- NEW: yellow, cleaner assigned, awaiting response
    'confirmed',                    -- green, cleaner accepted
    'in_progress',                  -- blue, cleaner clocked in
    'completed',                    -- gray, finished (canonical spelling)
    'flagged',                      -- red, issue
    'cancelled',                    -- red, cancelled
    'awaiting_quote',               -- yellow, no price yet
    'pending'                       -- legacy, preserved
  ])
);

-- 3. Comment on the column so future devs know the canonical meanings
COMMENT ON COLUMN public.jobs.status IS
  'Job lifecycle state. Canonical flow: pending_cleaner (yellow, unassigned) -> '
  'awaiting_cleaner_acceptance (yellow, awaiting cleaner yes/no) -> confirmed (green) -> '
  'in_progress -> completed. Declined acceptances revert status to pending_cleaner. '
  'See src/components/schedule/CalendarStatusColors.ts for UI color mapping.';
