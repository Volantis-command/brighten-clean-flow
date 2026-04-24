
-- Add portal_token to client_properties table
ALTER TABLE public.client_properties ADD COLUMN IF NOT EXISTS portal_token uuid UNIQUE DEFAULT gen_random_uuid();

-- Create job_feedback table
CREATE TABLE IF NOT EXISTS public.job_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id),
  client_id uuid NOT NULL,
  score integer,
  reasons jsonb DEFAULT '[]'::jsonb,
  attention_areas jsonb DEFAULT '[]'::jsonb,
  photo_urls jsonb DEFAULT '[]'::jsonb,
  comments text,
  same_cleaner_preference text,
  nps_score integer,
  feedback_token uuid UNIQUE DEFAULT gen_random_uuid(),
  submitted_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.job_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage feedback" ON public.job_feedback FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients view own feedback" ON public.job_feedback FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "Anyone can insert feedback by token" ON public.job_feedback FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());

-- Create clean_requests table
CREATE TABLE IF NOT EXISTS public.clean_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id),
  requested_date date,
  preferred_time text,
  clean_type text,
  frequency text,
  attention_areas jsonb DEFAULT '[]'::jsonb,
  notes text,
  same_cleaner boolean DEFAULT false,
  status text DEFAULT 'pending',
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.clean_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage clean_requests" ON public.clean_requests FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can manage own requests" ON public.clean_requests FOR ALL TO authenticated USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());

-- Create client_messages table
CREATE TABLE IF NOT EXISTS public.client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id),
  message text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound',
  sent_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone
);

ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage messages" ON public.client_messages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can manage own messages" ON public.client_messages FOR ALL TO authenticated USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());

-- Add feedback_score to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS feedback_score integer;

-- Add preferred_cleaner_id and guest_checkin to properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS preferred_cleaner_id uuid;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS guest_checkin_at timestamp with time zone;

-- Add onboard columns to client_properties
ALTER TABLE public.client_properties ADD COLUMN IF NOT EXISTS onboard_token uuid UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE public.client_properties ADD COLUMN IF NOT EXISTS onboard_used boolean DEFAULT false;
