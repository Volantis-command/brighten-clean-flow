-- NEUTERED during Lovable Cloud → owned Supabase migration (2026-04-25).
--
-- Original content: hardcoded INSERT of an admin user_role for UUID
-- 55c7ce5a-70f3-4e0e-ad83-ccf33903bf26 (second admin account on the
-- pre-migration database). Same FK issue as 20260327044434 — the
-- referenced auth.user doesn't exist at replay time. Data preserved in
-- the dump; restored via data-import. No-op here.

SELECT 1;
