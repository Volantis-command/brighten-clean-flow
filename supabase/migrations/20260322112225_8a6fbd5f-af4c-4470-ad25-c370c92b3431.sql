-- Staff leave table
CREATE TABLE public.staff_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text DEFAULT 'personal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_leave ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage staff_leave" ON public.staff_leave
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view own leave" ON public.staff_leave
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff can insert own leave" ON public.staff_leave
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Weekly availability column on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekly_availability jsonb DEFAULT '["mon","tue","wed","thu","fri"]'::jsonb;