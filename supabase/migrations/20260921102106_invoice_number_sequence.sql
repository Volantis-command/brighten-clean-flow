-- ============================================================================
-- One invoice number sequence for every Xero path (BJ, 21 Sep 2026).
--
-- Per-clean invoices were INV-1053 style, the invoice buttons and the weekly
-- run were BCL-2026-MUAQFXHY style. Everything now takes the next INV number
-- from here. A sequence can't hand the same number out twice, unlike the old
-- "highest INV number + 1" lookup, which two cleans finishing together could
-- both land on.
-- ============================================================================

create sequence if not exists public.invoice_number_seq;

-- Continue from the highest INV number already used.
select setval(
  'public.invoice_number_seq',
  greatest(
    1000,
    coalesce((select max(substring(xero_invoice_number from '^INV-(\d+)$')::bigint) from public.jobs), 0)
  )
);

create or replace function public.next_invoice_number()
returns text language sql security definer set search_path = public as $$
  select 'INV-' || nextval('public.invoice_number_seq')::text
$$;

-- Server only. revoke from public does not remove Supabase's default grants.
revoke all on function public.next_invoice_number() from public;
revoke execute on function public.next_invoice_number() from anon, authenticated;
grant execute on function public.next_invoice_number() to service_role;
revoke all on sequence public.invoice_number_seq from anon, authenticated;
grant usage, select on sequence public.invoice_number_seq to service_role;
