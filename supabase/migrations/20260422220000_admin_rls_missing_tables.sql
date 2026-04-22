-- Extend the "Admin full access" RLS blanket to tables missed by
-- 20260421180000_admin_full_access_all_tables.sql.
--
-- Audit (AUDIT_2026-04-22.md, C3) found 18 tables in the schema that
-- didn't have the admin blanket policy. Most are low-risk settings
-- tables but three are operational:
--   - leads             (quote pipeline)
--   - photos            (job photos generic bucket)
--   - sos_alerts        (cleaner safety)
--
-- Without the blanket, admins hit "new row violates RLS" when touching
-- any of these through the app. Same pattern as the original policy —
-- loop through table names, skip any that don't exist in this schema,
-- apply the admin-role check.
--
-- Idempotent: the same DROP-then-CREATE pattern as the original.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    -- Operational — urgent
    'leads',
    'photos',
    'sos_alerts',
    -- Settings / config tables
    'business_settings',
    'google_calendar_config',
    'guesty_config',
    'knowledge_base',
    'notification_settings',
    'pricing_settings',
    'sms_templates',
    'xero_settings',
    -- Client comms / tokens
    'client_comms',
    'client_messages',
    'client_tokens',
    'cleaner_job_tokens',
    -- Staff
    'staff_leave',
    -- Time-edit workflow
    'time_edit_queue',
    'time_edit_requests'
  ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping % — table does not exist', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "Admin full access" ON public.%I', t);

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
