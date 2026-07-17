-- Canonical, traceable cleaner onboarding.
--
-- `staff_onboarding` is the single source of truth for invitations, applicant
-- answers, compliance evidence, induction progress and deployment approval.
-- The older `cleaner_onboarding` table is retained read-only for historical
-- compatibility; its useful data is copied into the canonical record below.

ALTER TABLE public.staff_onboarding
  ADD COLUMN IF NOT EXISTS onboarding_version text NOT NULL DEFAULT 'B-ABNB-HR-002-v1.0',
  ADD COLUMN IF NOT EXISTS current_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS residential_suburb text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS id_document_type text,
  ADD COLUMN IF NOT EXISTS police_check_date date,
  ADD COLUMN IF NOT EXISTS public_liability_status text,
  ADD COLUMN IF NOT EXISTS public_liability_expiry date,
  ADD COLUMN IF NOT EXISTS work_rights_status text,
  ADD COLUMN IF NOT EXISTS drivers_licence_expiry date,
  ADD COLUMN IF NOT EXISTS transport_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_rego text,
  ADD COLUMN IF NOT EXISTS brightly_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS communication_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sop_acknowledgements jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_check jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prestart_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS training_record jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cleaner_declaration jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS digital_signature text,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sops_resign_due date,
  ADD COLUMN IF NOT EXISTS director_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS director_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS director_approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deployment_status text NOT NULL DEFAULT 'onboarding';

ALTER TABLE public.staff_onboarding
  DROP CONSTRAINT IF EXISTS staff_onboarding_current_step_check,
  DROP CONSTRAINT IF EXISTS staff_onboarding_deployment_status_check,
  DROP CONSTRAINT IF EXISTS staff_onboarding_public_liability_status_check,
  DROP CONSTRAINT IF EXISTS staff_onboarding_work_rights_status_check;

ALTER TABLE public.staff_onboarding
  ADD CONSTRAINT staff_onboarding_current_step_check CHECK (current_step BETWEEN 0 AND 7),
  ADD CONSTRAINT staff_onboarding_deployment_status_check CHECK (
    deployment_status IN ('onboarding', 'submitted', 'reviewed', 'training', 'approved', 'inactive')
  ),
  ADD CONSTRAINT staff_onboarding_public_liability_status_check CHECK (
    public_liability_status IS NULL OR public_liability_status IN ('yes', 'no', 'in_progress')
  ),
  ADD CONSTRAINT staff_onboarding_work_rights_status_check CHECK (
    work_rights_status IS NULL OR work_rights_status IN ('citizen_or_pr', 'visa', 'other')
  );

CREATE INDEX IF NOT EXISTS idx_staff_onboarding_status
  ON public.staff_onboarding (deployment_status, status, submitted_at);

CREATE INDEX IF NOT EXISTS idx_staff_onboarding_expiry
  ON public.staff_onboarding (token_expires_at)
  WHERE submitted_at IS NULL;

-- Existing links remain valid until used. New or refreshed links receive an
-- explicit expiry from the admin invitation function.
UPDATE public.staff_onboarding
SET token_expires_at = COALESCE(token_expires_at, now() + interval '30 days')
WHERE submitted_at IS NULL;

-- Preserve useful submissions from the duplicate authenticated onboarding
-- flow. Existing canonical values win; legacy documents are recorded so they
-- can be opened through a short-lived signed URL after the bucket is private.
INSERT INTO public.staff_onboarding (
  user_id,
  full_name,
  email,
  status,
  submitted_at,
  deployment_status,
  onboarding_version,
  token_expires_at
)
SELECT
  co.user_id,
  co.full_name,
  co.email,
  CASE WHEN co.onboarding_complete THEN 'submitted' ELSE 'pending' END,
  CASE WHEN co.onboarding_complete THEN COALESCE(co.signed_at, co.updated_at, co.created_at) END,
  CASE
    WHEN co.director_approved THEN 'approved'
    WHEN co.onboarding_complete THEN 'submitted'
    ELSE 'onboarding'
  END,
  'B-ABNB-HR-002-v1.0',
  CASE WHEN co.onboarding_complete THEN NULL ELSE now() + interval '30 days' END
FROM public.cleaner_onboarding co
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_onboarding so WHERE so.user_id = co.user_id
)
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.staff_onboarding so
SET
  full_name = COALESCE(so.full_name, co.full_name),
  phone = COALESCE(so.phone, co.mobile),
  email = COALESCE(so.email, co.email),
  date_of_birth = COALESCE(so.date_of_birth, co.date_of_birth::date),
  residential_suburb = COALESCE(so.residential_suburb, co.suburb),
  emergency_contact_name = COALESCE(so.emergency_contact_name, co.emergency_contact_name),
  emergency_contact_phone = COALESCE(so.emergency_contact_phone, co.emergency_contact_phone),
  abn = COALESCE(so.abn, co.abn),
  abn_status = COALESCE(so.abn_status, CASE WHEN co.abn IS NOT NULL THEN 'yes' END),
  is_contractor = true,
  bank_bsb = COALESCE(so.bank_bsb, co.bank_bsb),
  bank_account_number = COALESCE(so.bank_account_number, co.bank_account),
  bank_account_name = COALESCE(so.bank_account_name, co.bank_name),
  id_document_type = COALESCE(so.id_document_type, co.id_document_type),
  police_check_date = COALESCE(so.police_check_date, co.police_check_date::date),
  gst_registered = COALESCE(co.gst_registered, so.gst_registered),
  public_liability_expiry = COALESCE(so.public_liability_expiry, co.public_liability_expiry),
  drivers_licence_expiry = COALESCE(so.drivers_licence_expiry, co.drivers_licence_expiry),
  vehicle_rego = COALESCE(so.vehicle_rego, co.vehicle_rego),
  digital_signature = COALESCE(so.digital_signature, co.digital_signature),
  signed_at = COALESCE(so.signed_at, co.signed_at),
  sops_resign_due = COALESCE(so.sops_resign_due, co.sops_resign_due),
  director_approved = so.director_approved OR COALESCE(co.director_approved, false),
  onboarding_version = 'B-ABNB-HR-002-v1.0',
  document_manifest = so.document_manifest
    || CASE WHEN co.id_document_url IS NOT NULL THEN jsonb_build_object(
      'photo_id', jsonb_build_object('legacy_url', co.id_document_url, 'label', 'Photo ID', 'migrated_at', now())
    ) ELSE '{}'::jsonb END
    || CASE WHEN co.police_check_url IS NOT NULL THEN jsonb_build_object(
      'police_check', jsonb_build_object('legacy_url', co.police_check_url, 'label', 'Police check', 'migrated_at', now())
    ) ELSE '{}'::jsonb END
    || CASE WHEN co.profile_photo_url IS NOT NULL THEN jsonb_build_object(
      'profile_photo', jsonb_build_object('legacy_url', co.profile_photo_url, 'label', 'Profile photo', 'migrated_at', now())
    ) ELSE '{}'::jsonb END
    || CASE WHEN co.public_liability_url IS NOT NULL THEN jsonb_build_object(
      'public_liability', jsonb_build_object('legacy_url', co.public_liability_url, 'label', 'Public liability certificate', 'migrated_at', now())
    ) ELSE '{}'::jsonb END
    || CASE WHEN co.vevo_check_url IS NOT NULL THEN jsonb_build_object(
      'work_rights', jsonb_build_object('legacy_url', co.vevo_check_url, 'label', 'Work-rights evidence', 'migrated_at', now())
    ) ELSE '{}'::jsonb END,
  prestart_requirements = so.prestart_requirements || jsonb_build_object(
    'abn_provided', jsonb_build_object('completed', co.abn IS NOT NULL, 'source', 'legacy_migration'),
    'bank_details_provided', jsonb_build_object('completed', co.bank_bsb IS NOT NULL AND co.bank_account IS NOT NULL, 'source', 'legacy_migration'),
    'emergency_contact_provided', jsonb_build_object('completed', co.emergency_contact_name IS NOT NULL AND co.emergency_contact_phone IS NOT NULL, 'source', 'legacy_migration'),
    'id_uploaded', jsonb_build_object('completed', co.id_document_url IS NOT NULL, 'source', 'legacy_migration'),
    'police_check_received', jsonb_build_object('completed', co.police_check_url IS NOT NULL, 'source', 'legacy_migration'),
    'chemical_induction_passed', jsonb_build_object('completed', COALESCE(co.chemical_quiz_passed, false), 'source', 'legacy_migration')
  ),
  training_record = so.training_record || jsonb_build_object(
    'legacy_chemical_quiz', jsonb_build_object(
      'passed', COALESCE(co.chemical_quiz_passed, false),
      'score', co.chemical_quiz_score,
      'attempts', co.chemical_quiz_attempts
    )
  ),
  status = CASE WHEN co.onboarding_complete THEN 'submitted' ELSE so.status END,
  deployment_status = CASE
    WHEN so.director_approved OR COALESCE(co.director_approved, false) THEN 'approved'
    WHEN co.onboarding_complete THEN 'submitted'
    ELSE so.deployment_status
  END,
  submitted_at = CASE
    WHEN co.onboarding_complete THEN COALESCE(so.submitted_at, co.signed_at, co.updated_at, co.created_at)
    ELSE so.submitted_at
  END,
  updated_at = GREATEST(so.updated_at, COALESCE(co.updated_at, co.created_at))
FROM public.cleaner_onboarding co
WHERE co.user_id = so.user_id;

-- The invitation API is now the only anonymous access path. Raw token-table
-- reads/updates and anonymous storage access are removed before sensitive ID
-- and bank information is collected by the expanded flow.
DROP POLICY IF EXISTS "Anon can select onboarding by token" ON public.staff_onboarding;
DROP POLICY IF EXISTS "Anon can update onboarding by token" ON public.staff_onboarding;
DROP POLICY IF EXISTS "Anon can upload staff documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon can read staff documents" ON storage.objects;
DROP POLICY IF EXISTS "Public read staff-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to staff-documents" ON storage.objects;

-- Authenticated cleaners may read their own canonical record. Updates go
-- through the onboarding API so applicant fields cannot be used to set admin
-- review, training or deployment approval values.
DROP POLICY IF EXISTS "Staff can update own onboarding" ON public.staff_onboarding;

UPDATE storage.buckets
SET public = false
WHERE id = 'staff-documents';

DROP POLICY IF EXISTS "Admins can manage staff documents" ON storage.objects;
CREATE POLICY "Admins can manage staff documents"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'staff-documents'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Staff can read own private documents" ON storage.objects;
CREATE POLICY "Staff can read own private documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND name LIKE ('staff/' || auth.uid()::text || '/%')
);

-- The historical table remains available to admins for audit/reference, but
-- cleaners can no longer create a second independent onboarding submission.
DROP POLICY IF EXISTS "Users can insert own onboarding" ON public.cleaner_onboarding;
DROP POLICY IF EXISTS "Users can update own onboarding" ON public.cleaner_onboarding;
DROP POLICY IF EXISTS "Users can insert own cleaner_onboarding" ON public.cleaner_onboarding;
DROP POLICY IF EXISTS "Users can update own cleaner_onboarding" ON public.cleaner_onboarding;
DROP POLICY IF EXISTS "Users can view own cleaner_onboarding" ON public.cleaner_onboarding;

DROP POLICY IF EXISTS "Legacy onboarding visible to owner and admins" ON public.cleaner_onboarding;
CREATE POLICY "Legacy onboarding visible to owner and admins"
ON public.cleaner_onboarding FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

COMMENT ON TABLE public.staff_onboarding IS
  'Canonical staff onboarding record: invitation, applicant answers, private document manifest, induction progress and deployment approval.';

COMMENT ON TABLE public.cleaner_onboarding IS
  'Legacy cleaner onboarding data retained for historical reference; new submissions use staff_onboarding.';
