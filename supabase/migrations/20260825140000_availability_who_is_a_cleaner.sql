-- ============================================================================
-- A cleaner is someone with working hours, not someone with a job title
--
-- The engine returned nothing at all. The cause: it defined a cleaner as
-- somebody holding the 'cleaner' or 'head_cleaner' role, and NOBODY in this
-- database holds either. Jess Cowell, who is assigned to 223 upcoming cleans,
-- is set up as an admin. So the seed found no cleaners, nobody got hours, and
-- the engine honestly reported that nobody was free.
--
-- Tying availability to a role means it silently breaks whenever the roles are
-- untidy, which is exactly what happened. So the rule is now simply:
--
--     if you have working hours set, you are offered to clients.
--
-- That is self-maintaining and it matches how BJ thinks about it. To take
-- someone off the roster, delete their hours. To add someone, give them hours.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_date             date,
  p_duration_minutes int DEFAULT 120
)
RETURNS TABLE (slot time, cleaners_free int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_travel   int;
  v_notice   int;
  v_step     int;
  v_weekday  int := EXTRACT(DOW FROM p_date)::int;
  v_now      timestamp := timezone('Australia/Brisbane', now());
  v_earliest time := '00:00';
BEGIN
  IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
    p_duration_minutes := 120;
  END IF;

  SELECT COALESCE((SELECT value::int FROM app_settings WHERE key = 'booking_travel_minutes'), 30),
         COALESCE((SELECT value::int FROM app_settings WHERE key = 'booking_min_notice_minutes'), 180),
         COALESCE((SELECT value::int FROM app_settings WHERE key = 'booking_slot_step_minutes'), 30)
    INTO v_travel, v_notice, v_step;

  IF p_date < v_now::date THEN
    RETURN;
  ELSIF p_date = v_now::date THEN
    v_earliest := (v_now + make_interval(mins => v_notice))::time;
  END IF;

  RETURN QUERY
  WITH cleaners AS (
    -- Anyone with hours on the board. No role required.
    SELECT DISTINCT user_id FROM cleaner_weekly_availability
  ),
  windows AS (
    SELECT c.user_id,
           COALESCE(ca.start_time, w.start_time) AS start_time,
           COALESCE(ca.end_time,   w.end_time)   AS end_time
      FROM cleaners c
      LEFT JOIN cleaner_availability ca
             ON ca.user_id = c.user_id AND ca.date = p_date
      LEFT JOIN cleaner_weekly_availability w
             ON w.user_id = c.user_id AND w.weekday = v_weekday
     WHERE (ca.id IS NULL AND w.id IS NOT NULL)
        OR (ca.id IS NOT NULL AND ca.available = true
            AND COALESCE(ca.start_time, w.start_time) IS NOT NULL)
  ),
  busy AS (
    SELECT j.cleaner_1_id AS user_id,
           (j.scheduled_time - make_interval(mins => v_travel))::time AS busy_from,
           (j.scheduled_time
             + make_interval(mins => COALESCE(j.estimated_duration, 120) + v_travel))::time AS busy_to
      FROM jobs j
     WHERE j.scheduled_date = p_date AND j.status <> 'cancelled'
       AND j.cleaner_1_id IS NOT NULL AND j.scheduled_time IS NOT NULL
    UNION ALL
    SELECT j.cleaner_2_id,
           (j.scheduled_time - make_interval(mins => v_travel))::time,
           (j.scheduled_time
             + make_interval(mins => COALESCE(j.estimated_duration, 120) + v_travel))::time
      FROM jobs j
     WHERE j.scheduled_date = p_date AND j.status <> 'cancelled'
       AND j.cleaner_2_id IS NOT NULL AND j.scheduled_time IS NOT NULL
  ),
  candidates AS (
    SELECT DISTINCT gs::time AS slot
      FROM windows w,
           LATERAL generate_series(
             (p_date + w.start_time)::timestamp,
             (p_date + w.end_time)::timestamp - make_interval(mins => p_duration_minutes),
             make_interval(mins => v_step)
           ) gs
     WHERE gs::time >= v_earliest
  )
  SELECT c.slot,
         COUNT(DISTINCT w.user_id)::int AS cleaners_free
    FROM candidates c
    JOIN windows w
      ON c.slot >= w.start_time
     AND (c.slot + make_interval(mins => p_duration_minutes))::time <= w.end_time
   WHERE NOT EXISTS (
     SELECT 1 FROM busy b
      WHERE b.user_id = w.user_id
        AND c.slot < b.busy_to
        AND (c.slot + make_interval(mins => p_duration_minutes))::time > b.busy_from
   )
   GROUP BY c.slot
   ORDER BY c.slot;
END $$;

GRANT EXECUTE ON FUNCTION public.get_available_slots(date, int) TO anon, authenticated;

-- ── Give hours to whoever is actually cleaning ─────────────────────────────
-- Five or more non-cancelled jobs means this is a working cleaner, not someone
-- who appears on a one-off test job. On this database that is Jess (223 jobs)
-- and not BJ (1). Mon to Fri, 7am to 4pm, as a starting point to adjust.
INSERT INTO public.cleaner_weekly_availability (user_id, weekday, start_time, end_time)
SELECT x.user_id, d.weekday, '07:00'::time, '16:00'::time
  FROM (
    SELECT cleaner_1_id AS user_id, COUNT(*) n
      FROM public.jobs WHERE status <> 'cancelled' AND cleaner_1_id IS NOT NULL
     GROUP BY 1
    HAVING COUNT(*) >= 5
  ) x
  CROSS JOIN (SELECT generate_series(1,5) AS weekday) d
 WHERE NOT EXISTS (
   SELECT 1 FROM public.cleaner_weekly_availability w WHERE w.user_id = x.user_id
 );

COMMENT ON FUNCTION public.get_available_slots(date, int) IS
  'Start times on p_date where at least one cleaner is free for p_duration_minutes, with travel either side. A cleaner is anyone with rows in cleaner_weekly_availability. Returns times and a count only, so the public booking page can call it safely.';
