
-- Add missing column to cleaner_onboarding
ALTER TABLE public.cleaner_onboarding ADD COLUMN IF NOT EXISTS director_approved BOOLEAN DEFAULT false;

-- Create qc_audit_rooms table
CREATE TABLE public.qc_audit_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID REFERENCES public.qc_audits(id) ON DELETE CASCADE NOT NULL,
  room_name TEXT NOT NULL,
  rating TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qc_audit_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit rooms"
  ON public.qc_audit_rooms FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert audit rooms"
  ON public.qc_audit_rooms FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update audit rooms"
  ON public.qc_audit_rooms FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete audit rooms"
  ON public.qc_audit_rooms FOR DELETE TO authenticated
  USING (true);
