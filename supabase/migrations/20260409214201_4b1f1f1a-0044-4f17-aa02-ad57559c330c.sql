
-- Create time_edit_queue table for time edit approval workflow
CREATE TABLE IF NOT EXISTS public.time_edit_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid REFERENCES public.time_entries(id) ON DELETE CASCADE NOT NULL,
  proposed_clock_on timestamptz,
  proposed_clock_off timestamptz,
  reason text,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_edit_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage time_edit_queue"
  ON public.time_edit_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own edit requests"
  ON public.time_edit_queue FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Users can view own edit requests"
  ON public.time_edit_queue FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
