
-- Add new columns to staff_onboarding for the expanded form
ALTER TABLE public.staff_onboarding
  ADD COLUMN IF NOT EXISTS abn_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS id_document_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS id_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS police_check_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS police_check_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_days jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preferred_start_time text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_jobs_per_day text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS availability_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_connecteam boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_whatsapp boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy_acknowledgements jsonb DEFAULT '[]'::jsonb;

-- Create storage bucket for staff documents (ID, police check)
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-documents', 'staff-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow anon to upload to staff-documents (token-based forms)
CREATE POLICY "Anon can upload staff documents"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'staff-documents');

-- Allow anon to read staff documents
CREATE POLICY "Anon can read staff documents"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'staff-documents');

-- Allow admins full access to staff documents
CREATE POLICY "Admins can manage staff documents"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'staff-documents' AND (SELECT public.has_role(auth.uid(), 'admin'::public.app_role)));
