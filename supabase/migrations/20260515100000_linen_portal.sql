-- Linen Company Portal
-- Adds linen requirements to properties, delivery tracking table,
-- settings table, and a DB trigger that auto-creates a delivery row
-- + fires an async SMS whenever a job is inserted for a property
-- that has linen requirements configured.

-- ── 1. linen_requirements column on properties ──────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS linen_requirements TEXT;

-- ── 2. linen_settings ───────────────────────────────────────────────────────
-- One row: the linen company name + phone that receives SMSes and logs
-- into the portal.
CREATE TABLE IF NOT EXISTS public.linen_settings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  TEXT        NOT NULL DEFAULT 'Linen Company',
  phone         TEXT        NOT NULL DEFAULT '',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.linen_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage linen_settings"
  ON public.linen_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed a blank settings row so the admin form always has something to UPDATE.
INSERT INTO public.linen_settings (company_name, phone)
VALUES ('Linen Company', '')
ON CONFLICT DO NOTHING;

-- ── 3. linen_deliveries ──────────────────────────────────────────────────────
-- One row per job that needs linen delivered.
-- Created automatically by the trigger below.
CREATE TABLE IF NOT EXISTS public.linen_deliveries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID        NOT NULL REFERENCES public.jobs(id)       ON DELETE CASCADE,
  property_id         UUID                 REFERENCES public.properties(id) ON DELETE SET NULL,
  -- Snapshot of linen_requirements at the time the job was created.
  -- Stored here so edits to the property don't change historical records.
  linen_requirements  TEXT,
  -- 12 hours before the scheduled clean.
  deliver_by          TIMESTAMPTZ,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'delivered')),
  delivered_at        TIMESTAMPTZ,
  notes               TEXT,
  sms_sent_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linen_deliveries_job_id
  ON public.linen_deliveries(job_id);

CREATE INDEX IF NOT EXISTS idx_linen_deliveries_status
  ON public.linen_deliveries(status);

ALTER TABLE public.linen_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage linen_deliveries"
  ON public.linen_deliveries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service-role (edge functions) can read/write without RLS.
-- Edge functions connect with service_role_key which bypasses RLS.

-- ── 4. Trigger: auto-create delivery row + async SMS ─────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.handle_new_job_linen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linen_req   TEXT;
  v_linen_phone TEXT;
  v_deliver_by  TIMESTAMPTZ;
  v_clean_ts    TIMESTAMPTZ;
BEGIN
  -- Need a property to check linen requirements.
  IF NEW.property_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if the property has linen requirements configured.
  SELECT linen_requirements INTO v_linen_req
  FROM public.properties
  WHERE id = NEW.property_id;

  IF v_linen_req IS NULL OR trim(v_linen_req) = '' THEN
    RETURN NEW;
  END IF;

  -- Check if the linen company has a phone number configured.
  SELECT phone INTO v_linen_phone
  FROM public.linen_settings
  LIMIT 1;

  IF v_linen_phone IS NULL OR trim(v_linen_phone) = '' THEN
    RETURN NEW;
  END IF;

  -- Compute deliver_by: 12 hours before the scheduled clean time.
  -- Use 08:00 as the default if no time is recorded on the job.
  v_clean_ts := (
    NEW.scheduled_date::TEXT || ' ' ||
    COALESCE(NULLIF(trim(NEW.scheduled_time::TEXT), ''), '08:00:00')
  )::TIMESTAMPTZ;
  v_deliver_by := v_clean_ts - INTERVAL '12 hours';

  -- Avoid duplicate delivery rows (e.g. if a trigger fires twice somehow).
  IF EXISTS (SELECT 1 FROM public.linen_deliveries WHERE job_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Insert the delivery record.
  INSERT INTO public.linen_deliveries
    (job_id, property_id, linen_requirements, deliver_by, status)
  VALUES
    (NEW.id, NEW.property_id, v_linen_req, v_deliver_by, 'pending');

  -- Fire the SMS asynchronously (non-blocking) via pg_net.
  -- The edge function will handle its own error handling + sms_sent_at update.
  PERFORM extensions.net.http_post(
    url     := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/send-linen-sms',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('job_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

-- Drop and recreate so schema changes take effect cleanly.
DROP TRIGGER IF EXISTS trg_new_job_linen ON public.jobs;

CREATE TRIGGER trg_new_job_linen
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_job_linen();
