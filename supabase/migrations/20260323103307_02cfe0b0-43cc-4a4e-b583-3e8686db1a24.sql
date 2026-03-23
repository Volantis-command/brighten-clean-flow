
-- Allow anon to insert jobs (for onboarding form submissions)
CREATE POLICY "Anon can insert jobs from onboarding"
ON public.jobs FOR INSERT TO anon
WITH CHECK (status = 'awaiting_quote');
