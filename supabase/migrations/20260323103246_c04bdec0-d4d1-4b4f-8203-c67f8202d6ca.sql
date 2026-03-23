
-- Drop existing status check constraint and add awaiting_quote
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('scheduled', 'in_progress', 'complete', 'flagged', 'pending', 'confirmed', 'awaiting_quote'));
