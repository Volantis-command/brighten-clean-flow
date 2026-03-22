
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view knowledge_base" ON public.knowledge_base FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage knowledge_base" ON public.knowledge_base FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Also allow anonymous access for feedback submission (token-based, no login)
CREATE POLICY "Anon can insert feedback by token" ON public.job_feedback FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can select feedback by token" ON public.job_feedback FOR SELECT TO anon USING (true);
