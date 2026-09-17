-- ============================================================================
-- Invoice name on a client (BJ, 17 Sep 2026).
--
-- Some clients are billed under a company that isn't the name staff know them
-- by (Lynn's Property is billed to Morayfield Projects Pty Ltd). Every Xero
-- path uses invoice_name when it's set, and the client name when it's blank.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

alter table public.profiles add column if not exists invoice_name text;
