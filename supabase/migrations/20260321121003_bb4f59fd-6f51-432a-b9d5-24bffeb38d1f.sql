
-- Client-property linking table
CREATE TABLE public.client_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  guest_ready_sms boolean DEFAULT true,
  show_invoices boolean DEFAULT false,
  portal_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, property_id)
);

ALTER TABLE public.client_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own links" ON public.client_properties
  FOR SELECT TO authenticated USING (client_id = auth.uid());

CREATE POLICY "Admins manage client_properties" ON public.client_properties
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Property issues table
CREATE TABLE public.property_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id),
  property_id uuid REFERENCES public.properties(id),
  room text,
  description text,
  photo_url text,
  reported_by uuid,
  reported_at timestamptz DEFAULT now(),
  status text DEFAULT 'open',
  acknowledged_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.property_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view issues" ON public.property_issues
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'head_cleaner'));

CREATE POLICY "Admins can manage issues" ON public.property_issues
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Cleaners can report issues" ON public.property_issues
  FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Clients view own property issues" ON public.property_issues
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM client_properties cp WHERE cp.property_id = property_issues.property_id AND cp.client_id = auth.uid()));

CREATE POLICY "Clients can acknowledge issues" ON public.property_issues
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM client_properties cp WHERE cp.property_id = property_issues.property_id AND cp.client_id = auth.uid()));

-- Client RLS for existing tables
CREATE POLICY "Clients view linked properties" ON public.properties
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM client_properties cp WHERE cp.property_id = properties.id AND cp.client_id = auth.uid() AND cp.portal_active = true));

CREATE POLICY "Clients view property jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM client_properties cp WHERE cp.property_id = jobs.property_id AND cp.client_id = auth.uid()));

CREATE POLICY "Clients view property forms" ON public.job_forms
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM client_properties cp WHERE cp.property_id = job_forms.property_id AND cp.client_id = auth.uid()));

CREATE POLICY "Clients view property photos" ON public.photos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM client_properties cp WHERE cp.property_id = photos.property_id AND cp.client_id = auth.uid()));

CREATE POLICY "Clients view property audits" ON public.qc_audits
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM client_properties cp WHERE cp.property_id = qc_audits.property_id AND cp.client_id = auth.uid()));
