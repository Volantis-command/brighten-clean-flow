
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS internal_notes text;
