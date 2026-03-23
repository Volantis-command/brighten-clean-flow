
-- Add anon SELECT policy for jobs via client_properties token lookup
CREATE POLICY "Anon can view jobs via client_properties"
ON public.jobs FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.client_properties cp
    WHERE cp.property_id = jobs.property_id
  )
);

-- Add client_booking_sms_sent_at to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_booking_sms_sent_at timestamptz;
