-- Property hero image — admin-uploaded, distinct from cleaner-uploaded
-- job photos.
--
-- Background: PR #88 added a hero image to client-portal property
-- cards by pulling the latest cleaner-uploaded photo for that
-- property. That works after the first clean, but new properties
-- look empty until then. This adds an admin upload path: a single
-- "hero image" per property, set explicitly.
--
-- PropertyCard prefers properties.hero_image_url when set, else
-- falls back to the latest job photo, else the gradient placeholder.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

-- Public storage bucket for property hero images. Public so the
-- client portal can render them without an auth header (matches
-- the pattern of job-photos and quote-photos).
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-photos', 'property-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Admins + head_cleaners upload + delete (the people who'd be
-- managing the listing). Anyone (including the public client
-- portal which is unauthed) can read.
DO $$
BEGIN
  CREATE POLICY "Staff manage property photos"
    ON storage.objects FOR ALL TO authenticated
    USING (
      bucket_id = 'property-photos' AND (
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'head_cleaner')
      )
    )
    WITH CHECK (
      bucket_id = 'property-photos' AND (
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'head_cleaner')
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Anyone can view property photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'property-photos');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
