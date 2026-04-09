
-- 1. Notifications columns
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tier text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS target_role text;

DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_tier_check CHECK (tier IN ('critical', 'important', 'info'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.notifications SET tier = CASE
  WHEN type IN ('damage_reported', 'no_show_alert', 'cleaner_no_show') THEN 'critical'
  WHEN type IN ('geofence_override', 'extra_time_request', 'new_lead', 'onboarding', 'booking_request', 'job_declined', 'rebook', 'schedule_request', 'guesty_alert') THEN 'important'
  ELSE 'info'
END,
event_type = COALESCE(event_type, type)
WHERE event_type IS NULL;

-- 2. booking_suggestions
CREATE TABLE public.booking_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id),
  source text NOT NULL,
  external_ref text,
  guest_name text,
  checkin_date date,
  checkout_date date,
  suggested_clean_date date,
  suggested_clean_time time,
  status text DEFAULT 'pending',
  created_job_id uuid REFERENCES public.jobs(id),
  created_at timestamptz DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);
ALTER TABLE public.booking_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage booking_suggestions"
  ON public.booking_suggestions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view booking_suggestions"
  ON public.booking_suggestions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'head_cleaner'::app_role));

-- 3. Properties iCal columns
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ical_url text,
  ADD COLUMN IF NOT EXISTS ical_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS ical_source text;

-- 4. Quote lifecycle columns
ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_approved_by uuid,
  ADD COLUMN IF NOT EXISTS followup_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_change timestamptz;

-- 5. Fix alert_tiers constraint and seed
ALTER TABLE public.alert_tiers DROP CONSTRAINT IF EXISTS alert_tiers_event_type_key;

DO $$ BEGIN
  ALTER TABLE public.alert_tiers ADD CONSTRAINT alert_tiers_event_type_tier_key UNIQUE (event_type, tier);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.alert_tiers (event_type, tier, enabled) VALUES
  ('damage_reported', 'critical', true),
  ('cleaner_no_show', 'critical', true),
  ('geofence_violation', 'critical', true),
  ('quote_auto_expired', 'critical', true),
  ('access_failure', 'critical', true),
  ('sos_triggered', 'critical', true),
  ('new_lead', 'important', true),
  ('extra_time_request', 'important', true),
  ('time_edit_pending', 'important', true),
  ('qc_fail', 'important', true),
  ('quote_more_info', 'important', true),
  ('geofence_override', 'important', true),
  ('invoice_needs_approval', 'important', true),
  ('booking_suggestion_pending', 'important', true),
  ('cleaner_sops_expiring', 'important', true),
  ('cleaner_insurance_expiring', 'important', true),
  ('booking_confirmed', 'info', true),
  ('invoice_drafted', 'info', true),
  ('review_received', 'info', true),
  ('cleaner_checked_in', 'info', true),
  ('quote_sent', 'info', true),
  ('quote_accepted', 'info', true),
  ('quote_followup_pending', 'important', true)
ON CONFLICT (event_type, tier) DO NOTHING;

-- 6. Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
