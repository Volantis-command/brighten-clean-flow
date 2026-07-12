-- Brightly Autopilot foundation: a shared, explainable Guest Ready state.
-- This migration does not alter authentication, authorisation or RLS.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS guest_ready_state text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS guest_ready_confidence smallint NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS guest_ready_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS guest_ready_blocker text;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_guest_ready_state_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_guest_ready_state_check CHECK (
    guest_ready_state IN ('needs_action','scheduled','clean_underway','verification_pending','verified','cancelled')
  ),
  ADD CONSTRAINT jobs_guest_ready_confidence_check CHECK (
    guest_ready_confidence BETWEEN 0 AND 100
  );

CREATE OR REPLACE FUNCTION public.refresh_guest_ready_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    NEW.guest_ready_state := 'cancelled';
    NEW.guest_ready_confidence := 0;
    NEW.guest_ready_blocker := NULL;
  ELSIF NEW.status = 'completed' AND lower(COALESCE(NEW.audit_outcome, '')) IN ('pass','passed','approved') THEN
    NEW.guest_ready_state := 'verified';
    NEW.guest_ready_confidence := 100;
    NEW.guest_ready_verified_at := COALESCE(NEW.guest_ready_verified_at, now());
    NEW.guest_ready_blocker := NULL;
  ELSIF NEW.status = 'completed' THEN
    NEW.guest_ready_state := 'verification_pending';
    NEW.guest_ready_confidence := 85;
    NEW.guest_ready_blocker := 'Completion is waiting for QC verification.';
  ELSIF NEW.status = 'in_progress' THEN
    NEW.guest_ready_state := 'clean_underway';
    NEW.guest_ready_confidence := 65;
    NEW.guest_ready_blocker := NULL;
  ELSIF NEW.status IN ('pending_cleaner','awaiting_cleaner','awaiting_cleaner_acceptance') OR (NEW.cleaner_1_id IS NULL AND NEW.cleaner_2_id IS NULL) THEN
    NEW.guest_ready_state := 'needs_action';
    NEW.guest_ready_confidence := 20;
    NEW.guest_ready_blocker := 'A cleaner must be assigned and confirmed.';
  ELSE
    NEW.guest_ready_state := 'scheduled';
    NEW.guest_ready_confidence := 45;
    NEW.guest_ready_blocker := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_guest_ready_state ON public.jobs;
CREATE TRIGGER trg_refresh_guest_ready_state
BEFORE INSERT OR UPDATE OF status, cleaner_1_id, cleaner_2_id, audit_outcome
ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.refresh_guest_ready_state();

-- Initialise existing work without rewriting `status`; status-specific legacy
-- triggers must not be re-fired as a side effect of this deployment.
UPDATE public.jobs
SET guest_ready_state = CASE
      WHEN status = 'cancelled' THEN 'cancelled'
      WHEN status = 'completed' AND lower(COALESCE(audit_outcome, '')) IN ('pass','passed','approved') THEN 'verified'
      WHEN status = 'completed' THEN 'verification_pending'
      WHEN status = 'in_progress' THEN 'clean_underway'
      WHEN status IN ('pending_cleaner','awaiting_cleaner','awaiting_cleaner_acceptance') OR (cleaner_1_id IS NULL AND cleaner_2_id IS NULL) THEN 'needs_action'
      ELSE 'scheduled'
    END,
    guest_ready_confidence = CASE
      WHEN status = 'cancelled' THEN 0
      WHEN status = 'completed' AND lower(COALESCE(audit_outcome, '')) IN ('pass','passed','approved') THEN 100
      WHEN status = 'completed' THEN 85
      WHEN status = 'in_progress' THEN 65
      WHEN status IN ('pending_cleaner','awaiting_cleaner','awaiting_cleaner_acceptance') OR (cleaner_1_id IS NULL AND cleaner_2_id IS NULL) THEN 20
      ELSE 45
    END,
    guest_ready_verified_at = CASE
      WHEN status = 'completed' AND lower(COALESCE(audit_outcome, '')) IN ('pass','passed','approved') THEN COALESCE(guest_ready_verified_at, now())
      ELSE guest_ready_verified_at
    END,
    guest_ready_blocker = CASE
      WHEN status = 'completed' AND lower(COALESCE(audit_outcome, '')) NOT IN ('pass','passed','approved') THEN 'Completion is waiting for QC verification.'
      WHEN status IN ('pending_cleaner','awaiting_cleaner','awaiting_cleaner_acceptance') OR (cleaner_1_id IS NULL AND cleaner_2_id IS NULL) THEN 'A cleaner must be assigned and confirmed.'
      ELSE NULL
    END;

CREATE INDEX IF NOT EXISTS idx_jobs_guest_ready_attention
  ON public.jobs (scheduled_date, guest_ready_state)
  WHERE guest_ready_state IN ('needs_action','verification_pending');
