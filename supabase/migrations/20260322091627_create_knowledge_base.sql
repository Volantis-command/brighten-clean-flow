-- Creates the knowledge_base table that was missing from the migration
-- history. The table existed in Lovable Cloud (created via Lovable's UI)
-- but no CREATE TABLE statement was ever committed to the repo, so
-- replaying migrations on a fresh Supabase project failed at
-- 20260322091628 when it tried to `ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY` on a non-existent table.
--
-- Schema extracted from src/integrations/supabase/types.ts (the
-- current generated types are authoritative for columns).

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  code TEXT,
  content TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
