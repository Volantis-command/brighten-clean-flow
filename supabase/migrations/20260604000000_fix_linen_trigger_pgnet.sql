-- Fix linen trigger: use net.http_post() (correct pg_net schema) instead of
-- extensions.net.http_post which Postgres rejects as a cross-database reference.
-- Also wrap the HTTP call in an exception handler so a failed SMS never blocks
-- job creation.

CREATE OR REPLACE FUNCTION public.handle_new_job_linen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_linen_req   TEXT;
  v_linen_phone TEXT;
  v_deliver_by  TIMESTAMPTZ;
  v_clean_ts    TIMESTAMPTZ;
BEGIN
  IF NEW.property_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT linen_requirements INTO v_linen_req
  FROM public.properties
  WHERE id = NEW.property_id;

  IF v_linen_req IS NULL OR trim(v_linen_req) = '' THEN
    RETURN NEW;
  END IF;

  SELECT phone INTO v_linen_phone
  FROM public.linen_settings
  LIMIT 1;

  IF v_linen_phone IS NULL OR trim(v_linen_phone) = '' THEN
    RETURN NEW;
  END IF;

  v_clean_ts := (
    NEW.scheduled_date::TEXT || ' ' ||
    COALESCE(NULLIF(trim(NEW.scheduled_time::TEXT), ''), '08:00:00')
  )::TIMESTAMPTZ;
  v_deliver_by := v_clean_ts - INTERVAL '12 hours';

  IF EXISTS (SELECT 1 FROM public.linen_deliveries WHERE job_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.linen_deliveries
    (job_id, property_id, linen_requirements, deliver_by, status)
  VALUES
    (NEW.id, NEW.property_id, v_linen_req, v_deliver_by, 'pending');

  -- Fire SMS asynchronously. Wrapped in exception block so any pg_net
  -- failure (misconfigured extension, network, etc.) never rolls back the job.
  BEGIN
    PERFORM net.http_post(
      url     := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/send-linen-sms',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('job_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'linen SMS trigger failed (job %): %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_job_linen ON public.jobs;

CREATE TRIGGER trg_new_job_linen
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_job_linen();
