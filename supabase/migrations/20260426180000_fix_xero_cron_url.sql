-- Fix the xero-invoice-sync cron job URL post-migration.
--
-- The original migration 20260415140000_xero_invoice_sync_cron.sql
-- scheduled a 15-min pg_cron job that POSTs to:
--   https://mkknrxoqturkmpcmhvtt.supabase.co/functions/v1/xero-sync-invoice-status
-- That URL was Lovable Cloud's Supabase project. After the 2026-04-25
-- migration to the owned Sydney Supabase (ueomxjsqvmbjfufjauhe), that
-- URL is dead — Xero invoice paid-status sync has been silently failing
-- for the last 24 hours.
--
-- This migration unschedules the broken job and re-schedules it with
-- the correct Sydney URL. Idempotent (safe to re-run).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('xero-invoice-sync-15min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'xero-invoice-sync-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/xero-sync-invoice-status',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
