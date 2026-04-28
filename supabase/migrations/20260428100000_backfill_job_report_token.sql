-- Backfill report_token for any historical jobs that predate the
-- column default. Without this the client-portal "View clean report"
-- button silently falls back to the legacy edge function, which is
-- being deprecated.
--
-- Safe operation: report_token has a UNIQUE DEFAULT on jobs (uses
-- pgcrypto.gen_random_bytes), so this only fills in NULLs and never
-- rewrites an existing token. Schema-qualified to extensions.* because
-- the migration login role doesn't have `extensions` on its
-- search_path on Supabase prod (Brendan hit SQLSTATE 42883 without
-- the qualification).
UPDATE public.jobs
SET report_token = encode(extensions.gen_random_bytes(32), 'hex')
WHERE report_token IS NULL;
