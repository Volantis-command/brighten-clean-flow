-- NEUTERED during Lovable Cloud → owned Supabase migration (2026-04-25).
--
-- Original content: second backfill loop that built properties +
-- client_properties from quotes rows. Same story as
-- 20260420180000_backfill_client_properties.sql — depends on source
-- data that's absent during replay on a fresh DB. All backfilled data
-- is preserved in the export dump.

SELECT 1;
