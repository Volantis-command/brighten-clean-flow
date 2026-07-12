-- Canonical turnover identity for PMS/calendar-created jobs.
-- This migration changes scheduling integrity only; it does not alter RLS,
-- authentication, roles or function verification settings.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source_turnover_key text,
  ADD COLUMN IF NOT EXISTS source_external_refs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_conflict_reason text;

-- Preserve all existing rows. The oldest live Hostaway job becomes the
-- canonical turnover; later rows are flagged for the admin conflict queue.
WITH ranked AS (
  SELECT id,
         property_id,
         scheduled_date,
         row_number() OVER (
           PARTITION BY property_id, scheduled_date
           ORDER BY
             CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
             created_at ASC,
             id ASC
         ) AS rn
  FROM public.jobs
  WHERE source = 'hostaway'
    AND property_id IS NOT NULL
    AND scheduled_date IS NOT NULL
    AND status <> 'cancelled'
), canonical AS (
  SELECT id, 'hostaway:' || property_id::text || ':' || scheduled_date::text AS turnover_key
  FROM ranked
  WHERE rn = 1
)
UPDATE public.jobs j
SET source_turnover_key = canonical.turnover_key,
    source_external_refs = CASE
      WHEN j.hostaway_reservation_id IS NULL THEN j.source_external_refs
      ELSE ARRAY(SELECT DISTINCT value FROM unnest(j.source_external_refs || ARRAY[j.hostaway_reservation_id]) value)
    END
FROM canonical
WHERE j.id = canonical.id;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY property_id, scheduled_date
           ORDER BY
             CASE WHEN status = 'completed' THEN 0 ELSE 1 END,
             created_at ASC,
             id ASC
         ) AS rn
  FROM public.jobs
  WHERE source = 'hostaway'
    AND property_id IS NOT NULL
    AND scheduled_date IS NOT NULL
    AND status <> 'cancelled'
)
UPDATE public.jobs j
SET sync_conflict_reason = 'Duplicate Hostaway turnover retained for admin review; no new automatic work should be dispatched.'
FROM ranked
WHERE j.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_jobs_source_turnover_key
  ON public.jobs (source_turnover_key)
  WHERE source_turnover_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_source_external_refs
  ON public.jobs USING gin (source_external_refs);

CREATE INDEX IF NOT EXISTS idx_jobs_sync_conflicts
  ON public.jobs (scheduled_date)
  WHERE sync_conflict_reason IS NOT NULL;

-- Approved iCal suggestions already point to their job through
-- created_job_id. This index makes reconciliation efficient.
CREATE INDEX IF NOT EXISTS idx_booking_suggestions_created_job
  ON public.booking_suggestions (created_job_id)
  WHERE created_job_id IS NOT NULL;
