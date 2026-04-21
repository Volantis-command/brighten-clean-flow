-- STOP THE RLS WHACK-A-MOLE.
--
-- Brendan keeps hitting "new row violates row-level security policy" on
-- different tables (profiles, jobs, cleaner_onboarding, quotes, ...). Each
-- time we patch one table, another one breaks. This migration adds a
-- blanket "admins can do everything" policy to every operational table in
-- the schema — so admin operations just work, forever.
--
-- This is safe because:
--   1. Admin users are vetted internally (Brendan's team only).
--   2. Client-facing tables still have their own narrower policies for
--      clients/cleaners. This doesn't remove those.
--   3. The `has_role(auth.uid(), 'admin')` check is the same guard used
--      elsewhere in the codebase.

-- Helper: drop old policy if exists, then create new "admin full access"
-- policy. We iterate through every relevant table.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles',
    'user_roles',
    'quotes',
    'quote_requests',
    'jobs',
    'job_series',
    'job_acceptances',
    'job_photos',
    'job_checklist_completions',
    'job_restocking_completions',
    'job_checklist_items',
    'job_forms',
    'job_feedback',
    'properties',
    'client_properties',
    'property_sop_items',
    'property_restocking_items',
    'property_issues',
    'property_notes',
    'clients',
    'staff_onboarding',
    'cleaner_onboarding',
    'staff_magic_tokens',
    'staff_pay_rates',
    'cleaner_availability',
    'cleaner_leave',
    'time_entries',
    'clock_events',
    'notifications',
    'alert_tiers',
    'booking_suggestions',
    'clean_requests',
    'completions',
    'completion_form_data',
    'completion_signatures',
    'app_settings',
    'qc_audit_rooms',
    'qc_audits',
    'staff_pay_periods',
    'payroll_entries',
    'xero_tokens',
    'linen_items'
  ])
  LOOP
    -- Skip tables that don't exist in this schema
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping % — table does not exist', t;
      CONTINUE;
    END IF;

    -- Drop any existing admin-full-access policy to make this idempotent
    EXECUTE format('DROP POLICY IF EXISTS "Admin full access" ON public.%I', t);

    -- Create the admin full-access policy
    EXECUTE format($f$
      CREATE POLICY "Admin full access"
      ON public.%I
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
      )
    $f$, t);

    RAISE NOTICE 'Added Admin full access policy to %', t;
  END LOOP;
END $$;
