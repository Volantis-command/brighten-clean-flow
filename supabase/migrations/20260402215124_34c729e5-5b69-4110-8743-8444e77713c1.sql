
-- Add cancellation fields to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cancellation_notes text;

-- Create staff_pay_rates table
CREATE TABLE IF NOT EXISTS public.staff_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  rate_type text NOT NULL DEFAULT 'hourly',
  hourly_rate numeric DEFAULT 30,
  standard_rate numeric DEFAULT 65,
  deep_rate numeric DEFAULT 120,
  airbnb_rate numeric DEFAULT 75,
  commercial_rate numeric DEFAULT 90,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage staff pay rates"
  ON public.staff_pay_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view own pay rates"
  ON public.staff_pay_rates FOR SELECT TO authenticated
  USING (staff_id = auth.uid());
