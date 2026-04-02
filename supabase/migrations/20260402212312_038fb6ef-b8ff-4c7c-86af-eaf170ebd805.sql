
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS feedback_rating_sms_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cleaner_reminder_sms_sent_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_reminder_sms_sent_at timestamptz;
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS preferred_frequency text DEFAULT 'one_off';
