-- Fix: admin cannot upload documents to cleaner profiles
-- Error: "new row violates row-level security policy for table 'cleaner_onboarding'"
--
-- The cleaner_onboarding table's RLS policies only allowed the cleaner
-- themselves to insert/update. Admin needs full access to manage staff
-- profiles, upload documents, and complete onboarding on behalf of cleaners.

-- Allow admins to manage all cleaner_onboarding rows
DO $$
BEGIN
  -- Drop old restrictive policies if they exist
  DROP POLICY IF EXISTS "Admins can manage cleaner_onboarding" ON public.cleaner_onboarding;
  DROP POLICY IF EXISTS "Users can view own onboarding" ON public.cleaner_onboarding;
  DROP POLICY IF EXISTS "Users can insert own onboarding" ON public.cleaner_onboarding;
  DROP POLICY IF EXISTS "Users can update own onboarding" ON public.cleaner_onboarding;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Admin full access
CREATE POLICY "Admins can manage cleaner_onboarding"
  ON public.cleaner_onboarding FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Cleaners can view + update their own onboarding
CREATE POLICY "Users can view own onboarding"
  ON public.cleaner_onboarding FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding"
  ON public.cleaner_onboarding FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can update own onboarding"
  ON public.cleaner_onboarding FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Also fix staff_onboarding table if it has the same issue
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can manage staff_onboarding" ON public.staff_onboarding;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Admins can manage staff_onboarding"
  ON public.staff_onboarding FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
