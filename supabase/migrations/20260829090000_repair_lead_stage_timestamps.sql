-- ============================================================================
-- REPAIR: every lead in New claimed to be exactly as old as the migration
--
-- 20260821090000_lead_pipeline.sql did this:
--
--   ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz DEFAULT now()
--   ...
--   UPDATE quote_requests SET stage_changed_at = COALESCE(last_status_change, created_at)
--    WHERE stage_changed_at IS NULL;
--
-- ADD COLUMN with a DEFAULT fills every EXISTING row with that default, so by
-- the time the UPDATE ran there were no NULLs left and the backfill matched
-- nothing. Every pre-existing lead was stamped with the moment the migration
-- ran instead of when it actually arrived.
--
-- The visible symptom: 37 leads that came in weeks apart all read
-- "8 days in new", so there was no way to tell who had just landed.
--
-- A lead sitting in 'new' has by definition never changed stage, so its
-- stage_changed_at IS its arrival time. That makes this repair provable rather
-- than a guess, and it is deliberately limited to that one stage: for a lead
-- that HAS moved, stage_changed_at is real data and must not be touched.
-- ============================================================================

UPDATE public.quote_requests
   SET stage_changed_at = created_at
 WHERE stage = 'new'
   AND created_at IS NOT NULL
   AND stage_changed_at IS DISTINCT FROM created_at;
