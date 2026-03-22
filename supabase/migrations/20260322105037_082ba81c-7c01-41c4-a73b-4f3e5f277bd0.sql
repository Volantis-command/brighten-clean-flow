ALTER TABLE public.client_properties 
ADD COLUMN IF NOT EXISTS onboarding_sent_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS portal_link_sent_at timestamp with time zone DEFAULT NULL;