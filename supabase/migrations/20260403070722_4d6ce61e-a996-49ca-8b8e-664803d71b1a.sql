
-- Jobs: new workflow columns
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS clock_on_lat numeric,
  ADD COLUMN IF NOT EXISTS clock_on_lng numeric,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_pause_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_form_data jsonb,
  ADD COLUMN IF NOT EXISTS completion_signatures jsonb,
  ADD COLUMN IF NOT EXISTS completion_form_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_form_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS clock_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_raised_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS audit_rating integer,
  ADD COLUMN IF NOT EXISTS audit_notes text,
  ADD COLUMN IF NOT EXISTS audit_areas text[],
  ADD COLUMN IF NOT EXISTS audit_outcome text,
  ADD COLUMN IF NOT EXISTS audit_photos text[],
  ADD COLUMN IF NOT EXISTS audit_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS audited_by uuid;

-- Properties: special_instructions
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS special_instructions text;

-- Profiles: audit_scores
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS audit_scores integer[] NOT NULL DEFAULT '{}';
