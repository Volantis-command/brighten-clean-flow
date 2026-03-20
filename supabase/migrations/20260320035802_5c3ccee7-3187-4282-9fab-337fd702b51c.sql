-- Allow cleaners to update status on jobs they are assigned to
CREATE POLICY "Cleaners can update assigned job status"
ON public.jobs FOR UPDATE
TO authenticated
USING (
  cleaner_1_id = auth.uid() OR cleaner_2_id = auth.uid()
)
WITH CHECK (
  cleaner_1_id = auth.uid() OR cleaner_2_id = auth.uid()
);