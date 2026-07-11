-- ============================================================================
-- SYNC INTEGRITY — de-duplicate existing rows (soft, reversible) then add the
-- unique constraints that make duplicate cleans impossible going forward.
--
-- SAFETY: nothing is deleted. Duplicate EXTRA jobs are set to 'cancelled' and
-- duplicate EXTRA pending suggestions to 'expired'. The earliest row in each
-- group is kept live. Completed and in-progress jobs are never cancelled.
-- Run report-duplicate-jobs first to review what this will touch.
-- ============================================================================

-- Statuses that are safe to auto-cancel (never touch completed / in_progress).
-- The partial unique indexes below only cover these "live schedulable" states,
-- so historical completed duplicates never block index creation.

-- 1. One live job per Hostaway reservation ---------------------------------
--    (kills the compounding webhook/sync duplicate bug)
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY hostaway_reservation_id
                            ORDER BY created_at ASC, id ASC) AS rn
  FROM public.jobs
  WHERE hostaway_reservation_id IS NOT NULL
    AND status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed','in_progress')
)
UPDATE public.jobs j
SET status = 'cancelled',
    notes = COALESCE(j.notes, '') || E'\n[auto: duplicate reservation job cancelled by sync-integrity migration]'
FROM ranked
WHERE j.id = ranked.id
  AND ranked.rn > 1
  AND j.status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_hostaway_reservation_live
  ON public.jobs (hostaway_reservation_id)
  WHERE hostaway_reservation_id IS NOT NULL
    AND status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed');

-- 2. One live parent job per accepted quote --------------------------------
--    (kills the double-accept "two recurring series" bug)
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY linked_quote_id
                            ORDER BY created_at ASC, id ASC) AS rn
  FROM public.jobs
  WHERE linked_quote_id IS NOT NULL
    AND recurring_parent_id IS NULL
    AND status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed','in_progress')
)
UPDATE public.jobs j
SET status = 'cancelled',
    notes = COALESCE(j.notes, '') || E'\n[auto: duplicate quote booking cancelled by sync-integrity migration]'
FROM ranked
WHERE j.id = ranked.id
  AND ranked.rn > 1
  AND j.status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_quote_parent_live
  ON public.jobs (linked_quote_id)
  WHERE linked_quote_id IS NOT NULL
    AND recurring_parent_id IS NULL
    AND status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed');

-- 3. One live occurrence per recurring series per date ----------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY series_id, scheduled_date
                            ORDER BY created_at ASC, id ASC) AS rn
  FROM public.jobs
  WHERE series_id IS NOT NULL
    AND status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed','in_progress')
)
UPDATE public.jobs j
SET status = 'cancelled',
    notes = COALESCE(j.notes, '') || E'\n[auto: duplicate series occurrence cancelled by sync-integrity migration]'
FROM ranked
WHERE j.id = ranked.id
  AND ranked.rn > 1
  AND j.status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_series_date_live
  ON public.jobs (series_id, scheduled_date)
  WHERE series_id IS NOT NULL
    AND status IN ('pending_cleaner','awaiting_cleaner','scheduled','confirmed');

-- 4. One pending suggestion per (property, external reference) --------------
--    (stops duplicate pending suggestions that get approved separately)
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY property_id, external_ref
                            ORDER BY created_at ASC, id ASC) AS rn
  FROM public.booking_suggestions
  WHERE external_ref IS NOT NULL
    AND status = 'pending'
)
UPDATE public.booking_suggestions b
SET status = 'expired'
FROM ranked
WHERE b.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_booking_suggestions_pending_ref
  ON public.booking_suggestions (property_id, external_ref)
  WHERE external_ref IS NOT NULL AND status = 'pending';
