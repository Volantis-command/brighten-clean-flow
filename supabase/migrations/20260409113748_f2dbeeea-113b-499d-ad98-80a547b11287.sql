-- FIX 4: Add extra time tracking columns to time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS extra_time_minutes integer,
  ADD COLUMN IF NOT EXISTS extra_time_reason text,
  ADD COLUMN IF NOT EXISTS extra_time_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extra_time_decided_by uuid,
  ADD COLUMN IF NOT EXISTS extra_time_decided_at timestamptz;

-- FIX 7: Create time_edit_requests table
CREATE TABLE IF NOT EXISTS public.time_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  proposed_clock_in timestamptz,
  proposed_clock_out timestamptz,
  reason text NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_edit_requests ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage time_edit_requests"
  ON public.time_edit_requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can insert their own requests
CREATE POLICY "Users can insert own edit requests"
  ON public.time_edit_requests FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Users can view their own requests
CREATE POLICY "Users can view own edit requests"
  ON public.time_edit_requests FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));