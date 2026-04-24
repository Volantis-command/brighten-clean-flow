-- NEUTERED during Lovable Cloud → owned Supabase migration (2026-04-25).
--
-- Original content: backfill loop that walked quote_requests and
-- inserted missing properties + client_properties links. Designed to
-- fix historical data drift on Lovable Cloud. On a fresh Supabase with
-- zero quote_requests at migration-replay time, the backfill has
-- nothing to operate on AND any INSERTs it does would violate FKs
-- (profiles wouldn't exist yet).
--
-- The actual backfilled data is preserved in the export dump.

SELECT 1;
