-- Weekly invoice flag on client profiles
-- When true, jobs for this client are excluded from per-job auto-invoicing
-- and instead batched into a single Monday weekly invoice via the
-- xero-weekly-batch-invoice edge function.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_invoice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.weekly_invoice IS
  'When true, jobs are batched into a weekly Monday invoice (Mon–Sun) rather than invoiced per-job.';
