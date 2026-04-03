
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS completion_photos text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completion_notes text DEFAULT NULL;
