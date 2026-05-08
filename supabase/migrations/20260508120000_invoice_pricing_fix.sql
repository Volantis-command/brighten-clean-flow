-- Fix: invoicing pipeline holes
-- Brendan 2026-05-08: "many cleans not being invoiced. deep dive."
--
-- Root cause was a tangle of price columns + silent error swallowing on the
-- Hostaway-job path. This migration is the schema piece of the fix:
--
-- 1. Migrate any existing `price_turnover` values into `default_price` so we
--    have ONE canonical price per property. The PropertyFormPage was writing
--    to price_turnover while AddJobPage + xero-auto-invoice-job were reading
--    default_price — properties set up via the form had no price visible to
--    the invoice path. Drop reads/writes of price_turnover from the app
--    code; the column itself stays for now (cheap insurance against rollback).
--
-- 2. Add `invoice_error` to jobs so we can persist the reason an auto-invoice
--    attempt failed (e.g. "No price set on job"). xero-auto-invoice-job +
--    src/lib/jobInvoice.ts now write this and PendingInvoicesPage surfaces it.
--
-- 3. Allow `invoice_status = 'failed'` and `'skipped'` (already a free-text
--    column, just adding constants here for documentation; no enum change).

-- 1. Backfill default_price from price_turnover where missing
UPDATE public.properties
SET default_price = price_turnover
WHERE default_price IS NULL
  AND price_turnover IS NOT NULL
  AND price_turnover > 0;

-- 2. invoice_error column on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS invoice_error TEXT;

COMMENT ON COLUMN public.jobs.invoice_error IS
  'Last auto-invoice failure message. Set by xero-auto-invoice-job when it '
  'cannot create a draft (most commonly: no price set on job, Xero contact '
  'create failed, Xero API error). Cleared when invoice_status flips to '
  'draft/sent/paid. Surfaced on PendingInvoicesPage so admin can fix and retry.';

-- 3. Document the invoice_status values currently in use
COMMENT ON COLUMN public.jobs.invoice_status IS
  'Lifecycle of the Xero invoice for this job. Values: '
  '''none'' (not yet attempted), '
  '''draft'' (created in Xero as DRAFT, awaiting Brendan to send from Xero), '
  '''sent'' (authorised/sent in Xero), '
  '''paid'' (paid in Xero — synced via xero-sync-invoice-status cron every 15min), '
  '''voided'', '
  '''failed'' (auto-invoice threw — see invoice_error), '
  '''skipped'' (admin marked already-invoiced-elsewhere via PendingInvoicesPage).';
