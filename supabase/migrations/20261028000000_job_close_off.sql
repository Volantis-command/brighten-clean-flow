-- ============================================================================
-- Closing a clean off (BJ, 28 Oct 2026).
--
-- "i need a clear tick somewhere i can tick to say its closed off, invoice
-- sent, or no invoice needed but closed off, no further action needed."
--
-- One flag that means nothing further is owed on a clean. Paid is deliberately
-- not part of it: Xero owns paid. The calendar reads closed jobs pale with a
-- tick, and anything still open keeps its colour and wears a chip.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

alter table public.jobs
  add column if not exists closed_off_at timestamptz,
  add column if not exists closed_off_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_off_reason text
    check (closed_off_reason in ('invoice_sent', 'no_invoice_needed'));

create index if not exists jobs_open_close_off_idx
  on public.jobs (scheduled_date)
  where closed_off_at is null;

-- Backfill: already sent (or paid, which implies sent) means closed.
update public.jobs
   set closed_off_at = coalesce(invoice_sent_at, invoice_paid_at, invoice_raised_at, created_at, now()),
       closed_off_reason = 'invoice_sent'
 where closed_off_at is null
   and status = 'completed'
   and invoice_status in ('sent', 'authorised', 'paid');

-- A voided invoice on a finished clean was never going to be billed.
update public.jobs
   set closed_off_at = coalesce(created_at, now()),
       closed_off_reason = 'no_invoice_needed'
 where closed_off_at is null
   and status = 'completed'
   and invoice_status = 'voided';
