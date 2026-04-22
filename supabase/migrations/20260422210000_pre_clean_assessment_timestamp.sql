-- Hard gate for the pre-clean assessment.
--
-- Previously CleanWorkflowPage.resolveView checked
--   pre_clean_notes === null || extra_time_requested === null
-- to decide whether to show the assessment modal. That fails when either
-- column has a non-null default (empty object or false), so cleaners skip
-- straight to the active view without answering the two gate questions.
--
-- Single source of truth: a dedicated timestamp that the
-- PreJobAssessmentModal sets ONLY when both questions have been answered.
-- Null = assessment not done; any value = done.
--
-- Idempotent, additive — safe to run repeatedly.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pre_clean_assessment_completed_at timestamptz;
