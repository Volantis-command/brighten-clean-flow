
-- Add T&C fields to quote_requests
ALTER TABLE public.quote_requests 
  ADD COLUMN IF NOT EXISTS tcs_accepted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tcs_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tcs_version text;

-- Add photos field to quote_requests
ALTER TABLE public.quote_requests 
  ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;

-- Create quote-photos storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('quote-photos', 'quote-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for quote-photos bucket
CREATE POLICY "Anyone can upload quote photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'quote-photos');

CREATE POLICY "Anyone can view quote photos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'quote-photos');
