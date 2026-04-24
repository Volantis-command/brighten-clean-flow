CREATE TABLE IF NOT EXISTS public.job_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  cleaner_id uuid NOT NULL,
  acceptance_status text NOT NULL DEFAULT 'pending',
  sms_sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, cleaner_id)
);

ALTER TABLE public.job_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage job_acceptances"
  ON public.job_acceptances FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own acceptances"
  ON public.job_acceptances FOR SELECT TO authenticated
  USING (cleaner_id = auth.uid());

CREATE POLICY "System can insert acceptances"
  ON public.job_acceptances FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update acceptances"
  ON public.job_acceptances FOR UPDATE TO authenticated
  USING (true);