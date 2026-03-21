-- Create app_settings table
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage app_settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view app_settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

-- Create notification_settings table
CREATE TABLE public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification_settings" ON public.notification_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view notification_settings" ON public.notification_settings
  FOR SELECT TO authenticated
  USING (true);

-- Seed app_settings
INSERT INTO public.app_settings (key, value) VALUES
  ('company_name', 'Brightly'),
  ('company_phone', ''),
  ('company_email', ''),
  ('default_job_duration', '3'),
  ('geofence_radius', '200'),
  ('timezone', 'Australia/Brisbane');

-- Seed notification_settings
INSERT INTO public.notification_settings (key, enabled) VALUES
  ('notify_admin_job_completed', true),
  ('notify_admin_qc_fails', true),
  ('notify_cleaner_before_job', true),
  ('notify_admin_clock_in', false),
  ('notify_admin_clock_out', false);