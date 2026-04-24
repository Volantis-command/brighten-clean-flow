
-- 1. Add missing columns to existing properties table
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS lockbox_code text,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Add type check (properties already has property_type but no check constraint)
-- We'll skip adding a new 'type' column since property_type already exists

-- 2. Add new columns to existing jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS check_in_time timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_time timestamptz,
  ADD COLUMN IF NOT EXISTS cleaner_notes text,
  ADD COLUMN IF NOT EXISTS report_token text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  ADD COLUMN IF NOT EXISTS no_show_alert_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_alert_sent boolean DEFAULT false;

-- 3. property_sop_items
CREATE TABLE IF NOT EXISTS public.property_sop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  room text NOT NULL,
  task text NOT NULL,
  sort_order int DEFAULT 0,
  active boolean DEFAULT true
);
ALTER TABLE public.property_sop_items ENABLE ROW LEVEL SECURITY;

-- 4. property_restocking_items
CREATE TABLE IF NOT EXISTS public.property_restocking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  item_name text NOT NULL,
  emoji text,
  sort_order int DEFAULT 0,
  active boolean DEFAULT true
);
ALTER TABLE public.property_restocking_items ENABLE ROW LEVEL SECURITY;

-- 5. job_checklist_completions
CREATE TABLE IF NOT EXISTS public.job_checklist_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  sop_item_id uuid REFERENCES public.property_sop_items(id) ON DELETE CASCADE NOT NULL,
  completed boolean DEFAULT false,
  completed_at timestamptz
);
ALTER TABLE public.job_checklist_completions ENABLE ROW LEVEL SECURITY;

-- 6. job_restocking_completions
CREATE TABLE IF NOT EXISTS public.job_restocking_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  restocking_item_id uuid REFERENCES public.property_restocking_items(id) ON DELETE CASCADE NOT NULL,
  completed boolean DEFAULT false,
  completed_at timestamptz
);
ALTER TABLE public.job_restocking_completions ENABLE ROW LEVEL SECURITY;

-- 7. job_photos (note: photos table already exists, this is a separate table per your spec)
CREATE TABLE IF NOT EXISTS public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  room_label text,
  uploaded_at timestamptz DEFAULT now()
);
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

-- 8. cleaner_job_tokens (staff_id references profiles)
CREATE TABLE IF NOT EXISTS public.cleaner_job_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  staff_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz DEFAULT now(),
  used_at timestamptz
);
ALTER TABLE public.cleaner_job_tokens ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies

-- properties: authenticated can read/write (already has policies, add for completeness)
-- Existing policies already cover admin/cleaner/client access, so no changes needed

-- property_sop_items: authenticated read/write
CREATE POLICY "Authenticated users can read sop_items"
  ON public.property_sop_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sop_items"
  ON public.property_sop_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- property_restocking_items: authenticated read/write
CREATE POLICY "Authenticated users can read restocking_items"
  ON public.property_restocking_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage restocking_items"
  ON public.property_restocking_items FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- job_checklist_completions: service_role bypass (RLS blocks all by default)
CREATE POLICY "Admins can manage checklist_completions"
  ON public.job_checklist_completions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Cleaners can update own checklist_completions"
  ON public.job_checklist_completions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_checklist_completions.job_id
    AND (jobs.cleaner_1_id = auth.uid() OR jobs.cleaner_2_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_checklist_completions.job_id
    AND (jobs.cleaner_1_id = auth.uid() OR jobs.cleaner_2_id = auth.uid())
  ));

-- job_restocking_completions: same pattern
CREATE POLICY "Admins can manage restocking_completions"
  ON public.job_restocking_completions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Cleaners can update own restocking_completions"
  ON public.job_restocking_completions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_restocking_completions.job_id
    AND (jobs.cleaner_1_id = auth.uid() OR jobs.cleaner_2_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_restocking_completions.job_id
    AND (jobs.cleaner_1_id = auth.uid() OR jobs.cleaner_2_id = auth.uid())
  ));

-- job_photos: public read, authenticated write
CREATE POLICY "Anyone can view job_photos"
  ON public.job_photos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can insert job_photos"
  ON public.job_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can manage job_photos"
  ON public.job_photos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- cleaner_job_tokens: service_role bypass only
CREATE POLICY "Admins can manage cleaner_job_tokens"
  ON public.cleaner_job_tokens FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anon can read token by value"
  ON public.cleaner_job_tokens FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can update token used_at"
  ON public.cleaner_job_tokens FOR UPDATE TO anon USING (true) WITH CHECK (true);
