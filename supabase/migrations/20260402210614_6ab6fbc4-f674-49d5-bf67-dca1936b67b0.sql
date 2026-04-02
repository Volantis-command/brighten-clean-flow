
-- Guesty config table
CREATE TABLE public.guesty_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  account_name text,
  auto_create_job boolean NOT NULL DEFAULT true,
  default_clean_type text NOT NULL DEFAULT 'standard',
  buffer_hours integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guesty_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage guesty_config" ON public.guesty_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Google Calendar config table
CREATE TABLE public.google_calendar_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  email text,
  calendar_id text,
  auto_create_event boolean NOT NULL DEFAULT true,
  add_cleaner boolean NOT NULL DEFAULT true,
  invite_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_calendar_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage google_calendar_config" ON public.google_calendar_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add guesty_reservation_id and google_event_id to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS guesty_reservation_id text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS google_event_id text;
