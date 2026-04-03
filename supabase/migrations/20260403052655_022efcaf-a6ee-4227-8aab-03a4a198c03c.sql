
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS damage_reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS damage_photos text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS damage_notes text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extra_time_photos text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extra_time_notes text DEFAULT NULL;
