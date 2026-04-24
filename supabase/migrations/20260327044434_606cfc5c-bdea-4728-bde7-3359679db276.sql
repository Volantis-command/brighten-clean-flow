-- NEUTERED during Lovable Cloud → owned Supabase migration (2026-04-25).
--
-- Original content: hardcoded INSERT of an admin user_role for UUID
-- 49c58c52-da55-4dfe-b66a-2e8fc7b5c5f0 (Brendan's admin account on the
-- pre-migration database). On a fresh Supabase the referenced auth.user
-- doesn't exist yet, so the INSERT failed an FK constraint when we
-- replayed the migration history. The role data is preserved in the
-- dump and will be restored via the data-import step, so this migration
-- being a no-op is fine.

SELECT 1;
