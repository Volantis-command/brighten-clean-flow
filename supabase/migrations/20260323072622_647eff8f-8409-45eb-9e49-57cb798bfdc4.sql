ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS review_sms_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS rebook_sms_sent_at timestamptz;

INSERT INTO public.notification_settings (key, enabled) VALUES
  ('send_google_review_sms', true),
  ('send_rebook_sms', true)
ON CONFLICT (key) DO NOTHING;