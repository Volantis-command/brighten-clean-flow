-- "On my way" timestamp for cleaners.
--
-- Cleaners tap "I'm on the way" before clocking on; the client portal's
-- live status banner then shows "Sarah is on her way" instead of a
-- blank pre-arrival state. No GPS — this is a manual signal that the
-- cleaner has left for the property.
--
-- Cleared automatically when the cleaner clocks on (the in_progress
-- banner takes over) — but we don't enforce that here, just zero it
-- via app code on clock_on success.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS on_route_at TIMESTAMPTZ;
