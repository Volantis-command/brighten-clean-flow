
-- 1. clock_events table
CREATE TABLE IF NOT EXISTS public.clock_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in', 'clock_out')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  distance_from_property_m DOUBLE PRECISION,
  geofence_warning BOOLEAN DEFAULT false,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clock events"
  ON public.clock_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'));

CREATE POLICY "Users can insert own clock events"
  ON public.clock_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. cleaner_availability table
CREATE TABLE IF NOT EXISTS public.cleaner_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.cleaner_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own availability"
  ON public.cleaner_availability FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'));

CREATE POLICY "Users can manage own availability"
  ON public.cleaner_availability FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own availability"
  ON public.cleaner_availability FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 3. cleaner_onboarding table
CREATE TABLE IF NOT EXISTS public.cleaner_onboarding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  mobile TEXT,
  email TEXT,
  date_of_birth TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  suburb TEXT,
  abn TEXT,
  abn_confirmed BOOLEAN DEFAULT false,
  bank_bsb TEXT,
  bank_account TEXT,
  bank_name TEXT,
  id_document_type TEXT,
  id_document_url TEXT,
  police_check_url TEXT,
  police_check_date TEXT,
  sop_master_acknowledged_at TIMESTAMPTZ,
  sop_linen_acknowledged_at TIMESTAMPTZ,
  sop_consumables_acknowledged_at TIMESTAMPTZ,
  sop_chemical_acknowledged_at TIMESTAMPTZ,
  sop_conduct_acknowledged_at TIMESTAMPTZ,
  sop_acknowledged_at TIMESTAMPTZ,
  chemical_quiz_passed BOOLEAN DEFAULT false,
  chemical_quiz_score INTEGER,
  chemical_quiz_attempts INTEGER DEFAULT 0,
  digital_signature TEXT,
  signed_at TIMESTAMPTZ,
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cleaner_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding"
  ON public.cleaner_onboarding FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own onboarding"
  ON public.cleaner_onboarding FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own onboarding"
  ON public.cleaner_onboarding FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
