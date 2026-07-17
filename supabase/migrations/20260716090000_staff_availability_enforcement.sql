-- Make cleaner availability operational instead of informational.
-- Admin overrides are explicit and retained on the job for audit purposes.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS availability_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_override_reason text,
  ADD COLUMN IF NOT EXISTS availability_override_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS availability_override_at timestamptz;

CREATE OR REPLACE FUNCTION public.cleaner_is_available_on_date(
  p_user_id uuid,
  p_date date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  explicit_available boolean;
  weekly jsonb;
  day_key text := lower(to_char(p_date, 'Dy'));
  day_full text := lower(trim(to_char(p_date, 'Day')));
BEGIN
  SELECT ca.available
  INTO explicit_available
  FROM public.cleaner_availability ca
  WHERE ca.user_id = p_user_id AND ca.date = p_date
  LIMIT 1;

  IF FOUND THEN
    RETURN explicit_available;
  END IF;

  SELECT p.weekly_availability
  INTO weekly
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF weekly IS NULL OR weekly = 'null'::jsonb THEN
    RETURN day_key IN ('mon', 'tue', 'wed', 'thu', 'fri');
  END IF;

  IF jsonb_typeof(weekly) = 'array' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(weekly) value
      WHERE lower(value) IN (day_key, day_full)
    );
  END IF;

  IF jsonb_typeof(weekly) = 'object' THEN
    RETURN weekly ? day_key
      AND jsonb_typeof(weekly -> day_key) = 'array'
      AND jsonb_array_length(weekly -> day_key) > 0;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_job_cleaner_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaner_1_unavailable boolean := false;
  cleaner_2_unavailable boolean := false;
BEGIN
  IF NEW.cleaner_1_id IS NOT NULL THEN
    cleaner_1_unavailable := NOT public.cleaner_is_available_on_date(NEW.cleaner_1_id, NEW.scheduled_date);
  END IF;
  IF NEW.cleaner_2_id IS NOT NULL THEN
    cleaner_2_unavailable := NOT public.cleaner_is_available_on_date(NEW.cleaner_2_id, NEW.scheduled_date);
  END IF;

  IF cleaner_1_unavailable OR cleaner_2_unavailable THEN
    IF NOT COALESCE(NEW.availability_override, false) THEN
      RAISE EXCEPTION 'Cleaner is unavailable on the scheduled date. An admin override is required.';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only an admin can override cleaner availability.';
    END IF;

    NEW.availability_override := true;
    NEW.availability_override_reason := COALESCE(
      NULLIF(trim(NEW.availability_override_reason), ''),
      'Admin manually overrode cleaner availability during scheduling.'
    );
    NEW.availability_override_by := auth.uid();
    NEW.availability_override_at := now();
  ELSE
    NEW.availability_override := false;
    NEW.availability_override_reason := NULL;
    NEW.availability_override_by := NULL;
    NEW.availability_override_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_job_cleaner_availability ON public.jobs;
CREATE TRIGGER trg_enforce_job_cleaner_availability
BEFORE INSERT OR UPDATE OF scheduled_date, cleaner_1_id, cleaner_2_id, availability_override
ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_job_cleaner_availability();

CREATE OR REPLACE FUNCTION public.update_own_staff_details(
  p_phone text,
  p_address text,
  p_suburb text,
  p_postcode text,
  p_emergency_name text,
  p_emergency_phone text,
  p_emergency_relationship text,
  p_available_days text[],
  p_availability_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  short_days text[];
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT COALESCE(array_agg(lower(left(day_name, 3))), ARRAY[]::text[])
  INTO short_days
  FROM unnest(COALESCE(p_available_days, ARRAY[]::text[])) AS day_name;

  UPDATE public.profiles
  SET
    phone = NULLIF(trim(p_phone), ''),
    weekly_availability = to_jsonb(short_days)
  WHERE id = current_user_id;

  UPDATE public.staff_onboarding
  SET
    phone = NULLIF(trim(p_phone), ''),
    address = NULLIF(trim(p_address), ''),
    residential_suburb = NULLIF(trim(p_suburb), ''),
    postcode = NULLIF(trim(p_postcode), ''),
    emergency_contact_name = NULLIF(trim(p_emergency_name), ''),
    emergency_contact_phone = NULLIF(trim(p_emergency_phone), ''),
    emergency_contact_relationship = NULLIF(trim(p_emergency_relationship), ''),
    available_days = to_jsonb(COALESCE(p_available_days, ARRAY[]::text[])),
    availability_notes = NULLIF(trim(p_availability_notes), ''),
    last_saved_at = now(),
    updated_at = now()
  WHERE user_id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_staff_details(text, text, text, text, text, text, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_staff_details(text, text, text, text, text, text, text, text[], text) TO authenticated;

COMMENT ON COLUMN public.jobs.availability_override IS
  'True only when an admin deliberately assigns a cleaner outside their recorded availability.';
