-- ============================================================================
-- Time off makes a cleaner unavailable (BJ, 14 Oct 2026).
--
-- staff_leave existed but cleaner_is_available_on_date never read it, so leave
-- was only a warning on the assign screen and someone on holiday could still
-- be put on a job. Leave now wins over a day's custom hours and over the usual
-- weekly pattern. An admin can still override on the job itself, exactly like
-- any other unavailable day.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

create or replace function public.cleaner_is_available_on_date(p_user_id uuid, p_date date)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  explicit_available boolean;
  weekly jsonb;
  day_key text := lower(to_char(p_date, 'Dy'));
  day_full text := lower(trim(to_char(p_date, 'Day')));
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.staff_leave sl
    WHERE sl.user_id = p_user_id
      AND p_date BETWEEN sl.start_date AND sl.end_date
  ) THEN
    RETURN false;
  END IF;

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
$function$;
