-- ============================================================================
-- Plain invoice numbers (BJ, 23 Sep 2026): "these invoice numbers are too
-- long... i just want simple invoice numbers. easy to follow. 0230 etc"
--
-- A 4-digit number, no prefix: 1058, 1059, 1060. Same sequence as before, so
-- it carries on from the highest number already used and never repeats one.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

create or replace function public.next_invoice_number()
returns text language sql security definer set search_path = public as $$
  select lpad(nextval('public.invoice_number_seq')::text, 4, '0')
$$;

revoke all on function public.next_invoice_number() from public;
revoke execute on function public.next_invoice_number() from anon, authenticated;
grant execute on function public.next_invoice_number() to service_role;
