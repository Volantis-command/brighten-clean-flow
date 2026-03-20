-- Drop and recreate storage policies to ensure they work
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view job photos" ON storage.objects;

-- Allow any authenticated user to upload to job-photos bucket
CREATE POLICY "Authenticated users can upload to job-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-photos');

-- Allow any authenticated user to update their uploads (needed for overwrite)
CREATE POLICY "Authenticated users can update job-photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'job-photos');

-- Allow public read access
CREATE POLICY "Public read access to job-photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'job-photos');

-- Fix photos table: keep it simple - authenticated users can insert with their own uploaded_by
DROP POLICY IF EXISTS "Users can upload photos" ON public.photos;
CREATE POLICY "Users can upload photos"
ON public.photos FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid());