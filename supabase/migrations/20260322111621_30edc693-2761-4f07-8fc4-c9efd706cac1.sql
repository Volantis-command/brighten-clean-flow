
CREATE TABLE IF NOT EXISTS public.job_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency text NOT NULL DEFAULT 'weekly',
  interval_weeks integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  cleaner_1_id uuid,
  cleaner_2_id uuid,
  clean_type text,
  notes text,
  price_ex_gst numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage job_series" ON public.job_series FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view job_series" ON public.job_series FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'head_cleaner'::app_role));

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.job_series(id) ON DELETE SET NULL;
