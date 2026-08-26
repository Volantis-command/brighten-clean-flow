-- ============================================================================
-- Who may change whose availability
--
-- BJ's rule: admins and head cleaners manage the whole roster. Everyone else
-- may only change their own hours.
--
-- Enforced in the DATABASE, not just hidden in the UI. Hiding a dropdown stops
-- an honest mistake; it does not stop anything else. A cleaner must not be able
-- to mark a colleague unavailable, because that quietly removes bookable slots
-- and costs jobs.
-- ============================================================================

DROP POLICY IF EXISTS "Cleaners manage their own week" ON public.cleaner_weekly_availability;
CREATE POLICY "Own hours, or the roster if you run it"
  ON public.cleaner_weekly_availability FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'head_cleaner'::app_role)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'head_cleaner'::app_role)
  );

-- Same rule for date exceptions. The original policies allowed a user to
-- INSERT only their own row and had no UPDATE or DELETE policy at all, so an
-- admin could not correct someone's day off, and nobody could undo one.
DROP POLICY IF EXISTS "Users can view own availability"   ON public.cleaner_availability;
DROP POLICY IF EXISTS "Users can manage own availability" ON public.cleaner_availability;
DROP POLICY IF EXISTS "Own days, or the roster if you run it" ON public.cleaner_availability;

CREATE POLICY "Own days, or the roster if you run it"
  ON public.cleaner_availability FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'head_cleaner'::app_role)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'head_cleaner'::app_role)
  );

COMMENT ON TABLE public.cleaner_availability IS
  'Date-specific exceptions to the normal week: off all day, or different hours. Editable by the person themselves, and by admins and head cleaners.';
