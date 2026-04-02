
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_lat numeric,
  ADD COLUMN IF NOT EXISTS arrived_lng numeric,
  ADD COLUMN IF NOT EXISTS clock_on timestamptz,
  ADD COLUMN IF NOT EXISTS clock_off timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS pre_clean_notes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completion_notes text;
