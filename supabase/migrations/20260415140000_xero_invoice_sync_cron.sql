-- Fix 3: Periodic Xero invoice status sync
--
-- The sync edge function (xero-sync-invoice-status) checks Xero for status
-- changes on outstanding invoices and updates jobs.invoice_status accordingly.
-- It also fires an admin notification when an invoice flips to 'paid'.
--
-- Until now this only ran once per admin-login (useXeroInvoiceSync hook).
-- That meant payments could sit undetected for days.
--
-- This migration schedules it via pg_cron to run every 15 minutes.
-- The function is configured in supabase/config.toml with verify_jwt = false,
-- so net.http_post can call it without an auth header.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop any prior schedule with the same name (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('xero-invoice-sync-15min');
EXCEPTION WHEN OTHERS THEN
  -- not scheduled yet, ignore
  NULL;
END $$;

-- Schedule the sync every 15 minutes
SELECT cron.schedule(
  'xero-invoice-sync-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mkknrxoqturkmpcmhvtt.supabase.co/functions/v1/xero-sync-invoice-status',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

COMMENT ON EXTENSION pg_net IS
  'Used by pg_cron jobs to invoke Supabase Edge Functions. Required for the '
  'xero-invoice-sync-15min schedule (see this migration).';
