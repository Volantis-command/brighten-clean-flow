-- Per-bedroom bed type structure on properties.
--
-- properties.bed_config is a free-text summary ("Bedroom 1: Queen,
-- Bedroom 2: King") that's already rendered to cleaners on the
-- Pre-Clock-On view. Keep that for backwards compat.
--
-- bed_types is the structured representation: a JSON object keyed by
-- bedroom index. e.g. { "0": "King", "1": "Queen", "2": "Two singles" }.
-- Lets the property edit form render N dropdowns (one per bedroom)
-- instead of asking admin to free-type a comma-separated string.
--
-- Brendan flagged 2026-04-26: bed config should be one dropdown per
-- bedroom, prefilled from intake.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS bed_types JSONB;
