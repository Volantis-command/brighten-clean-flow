-- Per-property auto-approval rules for Airbnb / iCal turnovers.
--
-- When the Hostaway / iCal sync ingests a guest checkout, it currently
-- creates a job in 'scheduled' status that requires manual confirmation.
-- Hosts who run a tight Airbnb operation want the cleans to just
-- happen — no daily approval ritual.
--
-- Settings:
--   auto_confirm_turnovers — master switch
--   auto_confirm_min_hours — only auto-confirm if the gap between
--     guest checkout and next checkin is at least N hours. Defaults to
--     0 (always auto-confirm). Tighter windows still flag for review.
--   auto_confirm_max_per_day — safety cap; if more than N cleans get
--     auto-created in one day across all properties (e.g. due to a
--     bad iCal sync), bail out and notify admin. Set per-property as
--     a hint; aggregation is across all the host's properties.
--
-- The sync edge functions (hostaway-sync-reservations, ical pipeline)
-- read these fields and decide between status='scheduled' (manual) vs
-- status='confirmed' (auto). Wiring those is a follow-up — this PR
-- ships the settings + UI so hosts can configure them now.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS auto_confirm_turnovers BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_confirm_min_hours INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_confirm_max_per_day INTEGER;
