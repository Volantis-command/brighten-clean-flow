-- ============================================================================
-- AVAILABILITY ENGINE
--
-- The problem it solves: a client booked a clean for an afternoon Jess was
-- already working. Nothing was checking. The client booking form had a free
-- date and time field, and the only availability data in the system was a
-- whole-day yes/no flag that had never been filled in by anyone.
--
-- Three layers, in priority order, per cleaner:
--   1. cleaner_weekly_availability  the normal week, eg Mon-Fri 7am-4pm
--   2. cleaner_availability         a specific date that differs (day off, or
--                                   different hours). Overrides the weekly one.
--   3. jobs already booked          blocked out, plus travel time either side
--
-- A slot is offerable when AT LEAST ONE cleaner is free for the whole length
-- of the clean, with travel either side. Adding a fifth cleaner needs no code
-- change: they set their week and the engine includes them.
-- ============================================================================

-- ── 1. The normal week ─────────────────────────────────────────────────────
-- Several rows per weekday are allowed, so split shifts work (a morning block
-- and an afternoon block with a gap for the school run).
CREATE TABLE IF NOT EXISTS public.cleaner_weekly_availability (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday    int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Sunday
  start_time time NOT NULL,
  end_time   time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS cleaner_weekly_availability_user_idx
  ON public.cleaner_weekly_availability (user_id, weekday);

ALTER TABLE public.cleaner_weekly_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cleaners manage their own week" ON public.cleaner_weekly_availability;
CREATE POLICY "Cleaners manage their own week"
  ON public.cleaner_weekly_availability FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- ── 2. Date-specific exceptions ────────────────────────────────────────────
-- cleaner_availability already existed as date + available. Adding times so it
-- can also mean "working, but only 7am to 11am today" instead of only
-- all-day-or-nothing, which was the reason it could not stop an afternoon
-- double booking.
ALTER TABLE public.cleaner_availability
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time   time,
  ADD COLUMN IF NOT EXISTS note       text;

-- ── 3. The settings BJ controls ────────────────────────────────────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('booking_travel_minutes',      '30'),
  ('booking_min_notice_minutes',  '180'),
  ('booking_slot_step_minutes',   '30')
ON CONFLICT (key) DO NOTHING;

-- ── The engine ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER on purpose: the public booking page must be able to ask
-- "what is free on Thursday" WITHOUT being able to read the jobs table, the
-- cleaner roster or anyone's roster. It returns times and a count, nothing else.
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

  -- Never offer a time in the past, or one too soon to physically get there.
  IF p_date < v_now::date THEN
    RETURN;
  ELSIF p_date = v_now::date THEN
    v_earliest := (v_now + make_interval(mins => v_notice))::time;
  END IF;

  RETURN QUERY
  WITH cleaners AS (
    -- Anyone who cleans. Add a cleaner and they appear here automatically.
    SELECT DISTINCT ur.user_id
      FROM user_roles ur
     WHERE ur.role IN ('cleaner', 'head_cleaner')
  ),
  windows AS (
    -- A date-specific row WINS over the normal week. If it says not available,
    -- that produces no window at all and the cleaner is out for the day.
    SELECT c.user_id,
           COALESCE(ca.start_time, w.start_time) AS start_time,
           COALESCE(ca.end_time,   w.end_time)   AS end_time
      FROM cleaners c
      LEFT JOIN cleaner_availability ca
             ON ca.user_id = c.user_id AND ca.date = p_date
      LEFT JOIN cleaner_weekly_availability w
             ON w.user_id = c.user_id AND w.weekday = v_weekday
     WHERE (ca.id IS NULL AND w.id IS NOT NULL)                    -- normal week
        OR (ca.id IS NOT NULL AND ca.available = true
            AND COALESCE(ca.start_time, w.start_time) IS NOT NULL) -- special hours
  ),
  busy AS (
    -- Every clean already booked blocks its cleaner, plus travel either side.
    -- Both cleaner slots count: a two-person job occupies both of them.
    SELECT j.cleaner_1_id AS user_id,
           (j.scheduled_time - make_interval(mins => v_travel))::time AS busy_from,
           (j.scheduled_time
             + make_interval(mins => COALESCE(j.estimated_duration, 120) + v_travel))::time AS busy_to
      FROM jobs j
     WHERE j.scheduled_date = p_date
       AND j.status <> 'cancelled'
       AND j.cleaner_1_id IS NOT NULL
       AND j.scheduled_time IS NOT NULL
    UNION ALL
    SELECT j.cleaner_2_id,
           (j.scheduled_time - make_interval(mins => v_travel))::time,
           (j.scheduled_time
             + make_interval(mins => COALESCE(j.estimated_duration, 120) + v_travel))::time
      FROM jobs j
     WHERE j.scheduled_date = p_date
       AND j.status <> 'cancelled'
       AND j.cleaner_2_id IS NOT NULL
       AND j.scheduled_time IS NOT NULL
  ),
  candidates AS (
    -- Every possible start time across everyone's windows, on the step.
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
     -- Overlap test: the clean must not touch any busy block for this cleaner.
     SELECT 1 FROM busy b
      WHERE b.user_id = w.user_id
        AND c.slot < b.busy_to
        AND (c.slot + make_interval(mins => p_duration_minutes))::time > b.busy_from
   )
   GROUP BY c.slot
   ORDER BY c.slot;
END $$;

REVOKE ALL ON FUNCTION public.get_available_slots(date, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_available_slots(date, int) TO anon, authenticated;

COMMENT ON FUNCTION public.get_available_slots(date, int) IS
  'Start times on p_date where at least one cleaner is free for p_duration_minutes, with travel either side. Reads the weekly pattern, date exceptions and booked jobs. Returns times only, never job or roster data, so the public booking page can call it safely.';

-- ── Seed a normal week for existing cleaners ───────────────────────────────
-- Without this the engine correctly returns nothing, because no cleaner has a
-- pattern yet, and an empty booking screen looks like a bug rather than an
-- honest "nobody is free". Mon to Fri, 7am to 4pm, for any cleaner who has no
-- pattern at all. Adjust per person in the app afterwards.
INSERT INTO public.cleaner_weekly_availability (user_id, weekday, start_time, end_time)
SELECT ur.user_id, d.weekday, '07:00'::time, '16:00'::time
  FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('cleaner','head_cleaner')) ur
  CROSS JOIN (SELECT generate_series(1,5) AS weekday) d      -- 1=Mon .. 5=Fri
 WHERE NOT EXISTS (
   SELECT 1 FROM public.cleaner_weekly_availability w WHERE w.user_id = ur.user_id
 );
