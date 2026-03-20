-- Allow admins to delete jobs
CREATE POLICY "Admins can delete jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete job_forms
CREATE POLICY "Admins can delete job_forms"
ON public.job_forms
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update job_forms (needed for cleanup)
CREATE POLICY "Admins can update job_forms"
ON public.job_forms
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));