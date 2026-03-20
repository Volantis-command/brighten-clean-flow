
-- Allow cleaners to view properties they are assigned to via jobs
CREATE POLICY "Cleaners can view assigned properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.property_id = properties.id
    AND (jobs.cleaner_1_id = auth.uid() OR jobs.cleaner_2_id = auth.uid())
  )
);
