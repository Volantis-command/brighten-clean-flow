-- Fix booking_suggestions.created_job_id foreign key so deleting a job
-- doesn't block with a constraint violation. Set to NULL on delete instead
-- of the default RESTRICT behaviour.

ALTER TABLE public.booking_suggestions
  DROP CONSTRAINT IF EXISTS booking_suggestions_created_job_id_fkey;

ALTER TABLE public.booking_suggestions
  ADD CONSTRAINT booking_suggestions_created_job_id_fkey
  FOREIGN KEY (created_job_id)
  REFERENCES public.jobs(id)
  ON DELETE SET NULL;
