
-- Create business_settings table (key/value like app_settings)
CREATE TABLE IF NOT EXISTS public.business_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  label text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage business_settings" ON public.business_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view business_settings" ON public.business_settings
  FOR SELECT TO authenticated
  USING (true);

-- Seed business_settings with default keys
INSERT INTO public.business_settings (key, value, label) VALUES
  ('business_name', '', 'Business Name'),
  ('abn', '', 'ABN'),
  ('business_address', '', 'Business Address'),
  ('business_phone', '', 'Business Phone'),
  ('business_email', '', 'Business Email'),
  ('logo_url', '', 'Logo URL');

-- Create sms_templates table
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  body text NOT NULL DEFAULT '',
  variables jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sms_templates" ON public.sms_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view sms_templates" ON public.sms_templates
  FOR SELECT TO authenticated
  USING (true);

-- Seed sms_templates
INSERT INTO public.sms_templates (key, body, variables) VALUES
  ('quote_sms', 'Hi {client_name}, your quote for {property_name} is ready: {quote_amount}. Reply YES to accept.', '["client_name","property_name","quote_amount"]'::jsonb),
  ('booking_confirm', 'Hi {client_name}, your clean at {property_name} is confirmed for {date} at {time}.', '["client_name","property_name","date","time"]'::jsonb),
  ('cleaner_assigned_to_cleaner', 'Hi {cleaner_name}, you''ve been assigned to {property_name} on {date} at {time}.', '["cleaner_name","property_name","date","time"]'::jsonb),
  ('cleaner_assigned_to_client', 'Hi {client_name}, {cleaner_name} will be cleaning {property_name} on {date} at {time}.', '["client_name","cleaner_name","property_name","date","time"]'::jsonb),
  ('review_request', 'Hi {client_name}, how was your clean at {property_name}? We''d love your feedback!', '["client_name","property_name"]'::jsonb),
  ('damage_alert_to_head_cleaner', 'ALERT: Damage reported at {property_name} by {cleaner_name}. Please review.', '["property_name","cleaner_name"]'::jsonb),
  ('damage_alert_to_client', 'Hi {client_name}, we''ve identified an issue at {property_name} and will follow up shortly.', '["client_name","property_name"]'::jsonb),
  ('reminder_12hr_before', 'Reminder: You have a clean at {property_name} tomorrow at {time}.', '["property_name","time","date"]'::jsonb),
  ('no_reply_followup_30day', 'Hi {client_name}, we sent you a quote for {property_name} 30 days ago. Still interested? Reply YES.', '["client_name","property_name"]'::jsonb);

-- Seed new pricing_settings keys
INSERT INTO public.pricing_settings (key, value, label, category) VALUES
  ('travel_zone_1_max_km', 25, 'Zone 1 Max KM', 'travel'),
  ('travel_zone_1_fee', 0, 'Zone 1 Fee', 'travel'),
  ('travel_zone_2_max_km', 35, 'Zone 2 Max KM', 'travel'),
  ('travel_zone_2_fee', 20, 'Zone 2 Fee', 'travel'),
  ('travel_zone_3_fee', 30, 'Zone 3 Fee (35km+)', 'travel'),
  ('multi_property_discount_pct', 5, 'Multi-Property Discount %', 'pricing'),
  ('min_callout_hours', 2, 'Minimum Call-Out Hours', 'pricing'),
  ('client_quote_gp_pct', 32, 'Client Self-Quote GP %', 'pricing'),
  ('admin_gp_pct', 40, 'Admin GP %', 'pricing')
ON CONFLICT (key) DO NOTHING;

-- Create alert_tiers table
CREATE TABLE IF NOT EXISTS public.alert_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tier text NOT NULL,
  event_type text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.alert_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage alert_tiers" ON public.alert_tiers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view alert_tiers" ON public.alert_tiers
  FOR SELECT TO authenticated
  USING (true);

-- Seed alert tiers
INSERT INTO public.alert_tiers (tier, event_type) VALUES
  ('critical', 'damage_reported'),
  ('critical', 'cleaner_no_show'),
  ('critical', 'access_failure'),
  ('critical', 'geofence_override'),
  ('important', 'quote_needs_approval'),
  ('important', 'booking_needs_assignment'),
  ('important', 'time_edit_pending'),
  ('important', 'quote_expiring_48h'),
  ('important', 'qc_below_80'),
  ('important', 'cleaner_rejected_job'),
  ('info', 'quote_accepted'),
  ('info', 'job_completed'),
  ('info', 'clock_on'),
  ('info', 'clock_off'),
  ('info', 'new_client'),
  ('info', 'review_5_star');
