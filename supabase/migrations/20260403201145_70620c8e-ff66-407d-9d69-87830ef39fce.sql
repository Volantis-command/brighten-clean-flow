
-- Client communication log
CREATE TABLE IF NOT EXISTS public.client_comms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  message_body text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.client_comms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read client_comms" ON public.client_comms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert client_comms" ON public.client_comms FOR INSERT TO authenticated WITH CHECK (true);

-- SOS alerts table
CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id uuid NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  triggered_at timestamptz DEFAULT now(),
  lat double precision,
  lng double precision,
  resolved boolean DEFAULT false
);

ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read sos_alerts" ON public.sos_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sos_alerts" ON public.sos_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sos_alerts" ON public.sos_alerts FOR UPDATE TO authenticated USING (true);
