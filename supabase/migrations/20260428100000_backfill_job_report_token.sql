-- Backfill report_token for any historical jobs that predate the
-- column default. Without this the client-portal "View clean report"
-- button silently falls back to the legacy edge function, which is
-- being deprecated.
--
-- Safe operation: report_token has a UNIQUE DEFAULT
-- encode(gen_random_bytes(32), 'hex') on jobs, so this only fills in
-- NULLs and never rewrites an existing token.
UPDATE public.jobs
SET report_token = encode(gen_random_bytes(32), 'hex')
WHERE report_token IS NULL;
