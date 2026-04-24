-- NEUTERED during Lovable Cloud → owned Supabase migration (2026-04-25).
--
-- Original content: seeded Lynn Robertson and Alexandra as live clients
-- (properties + profiles + user_roles + client_properties). Used
-- gen_random_uuid() for new profile IDs that didn't correspond to any
-- auth.user, which fails FK constraints on a fresh Supabase.
--
-- All client data this migration seeded is preserved in the export dump
-- from Lovable Cloud and will be restored via the data-import step.
-- Keeping the file here with a no-op body so the migration history
-- stays aligned with what ran on Lovable Cloud, even though the actual
-- row inserts become a no-op on the new DB.

SELECT 1;
