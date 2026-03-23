
CREATE TABLE public.quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  phone text,
  email text,
  address text,
  property_type text,
  bedrooms integer,
  bathrooms integer,
  toilets integer,
  has_garage boolean DEFAULT false,
  property_size text,
  clean_type text,
  preferred_date date,
  preferred_time text,
  is_occupied boolean,
  extra_notes text,
  referral_source text,
  hourly_rate numeric,
  estimated_hours numeric,
  addons jsonb DEFAULT '[]'::jsonb,
  total_ex_gst numeric,
  total_inc_gst numeric,
  status text NOT NULL DEFAULT 'pending_form',
  form_submitted_at timestamptz,
  quote_sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_client_id uuid
);

ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage quote_requests" ON public.quote_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anon can insert quote_requests" ON public.quote_requests
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can select quote by token" ON public.quote_requests
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can update quote by token" ON public.quote_requests
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);
