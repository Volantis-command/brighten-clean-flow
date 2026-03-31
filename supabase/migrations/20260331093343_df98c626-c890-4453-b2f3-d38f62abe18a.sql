CREATE OR REPLACE FUNCTION public.guard_public_lead_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'anon' THEN
    IF OLD.id IS DISTINCT FROM NEW.id
      OR OLD.created_at IS DISTINCT FROM NEW.created_at
      OR OLD.first_name IS DISTINCT FROM NEW.first_name
      OR OLD.last_name IS DISTINCT FROM NEW.last_name
      OR OLD.phone IS DISTINCT FROM NEW.phone
      OR OLD.email IS DISTINCT FROM NEW.email
      OR OLD.address IS DISTINCT FROM NEW.address
      OR OLD.suburb IS DISTINCT FROM NEW.suburb
      OR OLD.service_type IS DISTINCT FROM NEW.service_type
      OR OLD.bedrooms IS DISTINCT FROM NEW.bedrooms
      OR OLD.bathrooms IS DISTINCT FROM NEW.bathrooms
      OR OLD.referral_source IS DISTINCT FROM NEW.referral_source
      OR OLD.notes IS DISTINCT FROM NEW.notes
    THEN
      RAISE EXCEPTION 'Anonymous booking updates can only change preferred_date, preferred_time, and status';
    END IF;

    IF OLD.status <> 'quote_sent' THEN
      RAISE EXCEPTION 'Lead is not available for booking';
    END IF;

    IF NEW.status <> 'booking_requested' THEN
      RAISE EXCEPTION 'Invalid booking status';
    END IF;

    IF NEW.preferred_date IS NULL OR NEW.preferred_time IS NULL THEN
      RAISE EXCEPTION 'Preferred date and time are required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_public_lead_booking_update ON public.leads;
CREATE TRIGGER guard_public_lead_booking_update
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.guard_public_lead_booking_update();

DROP POLICY IF EXISTS "Anon can submit lead booking" ON public.leads;
CREATE POLICY "Anon can submit lead booking"
ON public.leads
FOR UPDATE
TO anon
USING (status = 'quote_sent')
WITH CHECK (
  status = 'booking_requested'
  AND preferred_date IS NOT NULL
  AND preferred_time IS NOT NULL
);