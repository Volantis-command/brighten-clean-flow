-- Default portal_active to true on client_properties + backfill existing.
--
-- Bug Brendan flagged 2026-04-26: client Andrew has 2 properties on the
-- admin Client Detail page but only 1 shows in his client portal.
--
-- Root cause: client-portal-data edge function filters on
--   .eq('portal_active', true)
-- Existing rows had portal_active = null because there's no DB-level
-- default and the admin "Add Property" flow doesn't set it. So linked
-- properties past the first one never showed up on the portal.
--
-- Fix:
-- 1. Set DEFAULT TRUE on the column so future inserts default to true
-- 2. Backfill existing null/false rows that have a real client_id +
--    property_id (i.e. real links the admin made — they should all be
--    visible on the portal unless explicitly disabled later)
--
-- "Hide from portal" remains a future explicit admin action: just set
-- portal_active = false on a specific link.

ALTER TABLE public.client_properties
  ALTER COLUMN portal_active SET DEFAULT TRUE;

UPDATE public.client_properties
SET portal_active = TRUE
WHERE portal_active IS NULL OR portal_active = FALSE;
