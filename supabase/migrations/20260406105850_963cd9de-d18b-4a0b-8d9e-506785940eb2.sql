-- ============================================================================
-- Cleaner Portal: Onboarding, Clock Events, Availability, QC, SOP Knowledge Base
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. cleaner_onboarding — captures the digital onboarding submission
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cleaner_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Step 1 — personal
  full_name TEXT,
  mobile TEXT,
  email TEXT,
  date_of_birth DATE,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  suburb TEXT,

  -- Step 2 — compliance
  abn TEXT,
  abn_confirmed BOOLEAN DEFAULT false,
  bank_bsb TEXT,
  bank_account TEXT,
  bank_name TEXT,
  id_document_url TEXT,
  id_document_type TEXT, -- 'licence' | 'passport'
  police_check_url TEXT,
  police_check_date DATE,

  -- Step 3 — SOP acknowledgements (each ack stores the timestamp it was checked)
  sop_master_acknowledged_at TIMESTAMPTZ,
  sop_linen_acknowledged_at TIMESTAMPTZ,
  sop_consumables_acknowledged_at TIMESTAMPTZ,
  sop_chemical_acknowledged_at TIMESTAMPTZ,
  sop_conduct_acknowledged_at TIMESTAMPTZ,
  sop_acknowledged_at TIMESTAMPTZ,

  -- Step 4 — chemical safety quiz
  chemical_quiz_passed BOOLEAN DEFAULT false,
  chemical_quiz_score INTEGER,
  chemical_quiz_attempts INTEGER DEFAULT 0,

  -- Step 5 — final sign-off
  digital_signature TEXT,
  signed_at TIMESTAMPTZ,

  -- Status
  onboarding_complete BOOLEAN DEFAULT false,
  director_approved BOOLEAN DEFAULT false,
  director_approved_at TIMESTAMPTZ,
  director_approved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

ALTER TABLE public.cleaner_onboarding ENABLE ROW LEVEL SECURITY;

-- A cleaner can see and edit only their own row
CREATE POLICY "Users can view own cleaner_onboarding"
  ON public.cleaner_onboarding FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'));

CREATE POLICY "Users can insert own cleaner_onboarding"
  ON public.cleaner_onboarding FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own cleaner_onboarding"
  ON public.cleaner_onboarding FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage cleaner_onboarding"
  ON public.cleaner_onboarding FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_cleaner_onboarding_user ON public.cleaner_onboarding(user_id);

-- ----------------------------------------------------------------------------
-- 2. clock_events — GPS clock-in/out audit trail (separate from time_entries)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in', 'clock_out')),
  lat NUMERIC,
  lng NUMERIC,
  distance_from_property_m NUMERIC,
  geofence_warning BOOLEAN DEFAULT false,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clock_events"
  ON public.clock_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'));

CREATE POLICY "Users can insert own clock_events"
  ON public.clock_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage clock_events"
  ON public.clock_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_clock_events_user_event_at ON public.clock_events(user_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_clock_events_job ON public.clock_events(job_id);

-- ----------------------------------------------------------------------------
-- 3. cleaner_availability — weekly day-by-day availability
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cleaner_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.cleaner_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cleaner_availability"
  ON public.cleaner_availability FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'));

CREATE POLICY "Users can manage own cleaner_availability"
  ON public.cleaner_availability FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_cleaner_availability_user_date ON public.cleaner_availability(user_id, date);

-- ----------------------------------------------------------------------------
-- 4. job_room_completions — per-room checklist + photo completions
--    (the existing job_checklist_completions table is keyed by sop_item_id;
--    this new table is per-room with photo_url for the cleaner portal flow)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_room_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, room_name)
);

ALTER TABLE public.job_room_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view job_room_completions"
  ON public.job_room_completions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert job_room_completions"
  ON public.job_room_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Cleaners can update own job_room_completions"
  ON public.job_room_completions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'));

CREATE INDEX IF NOT EXISTS idx_job_room_completions_job ON public.job_room_completions(job_id);

-- ----------------------------------------------------------------------------
-- 5. qc_audit_rooms — per-room rating for the head-cleaner QC module
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qc_audit_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.qc_audits(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('pass', 'pass_with_notes', 'fail')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qc_audit_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view qc_audit_rooms"
  ON public.qc_audit_rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Head cleaners and admins can manage qc_audit_rooms"
  ON public.qc_audit_rooms FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'head_cleaner'));

CREATE INDEX IF NOT EXISTS idx_qc_audit_rooms_audit ON public.qc_audit_rooms(audit_id);

-- ----------------------------------------------------------------------------
-- 6. sop_documents — knowledge base for the AI assistant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sop_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  sop_code TEXT,
  category TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sop_documents"
  ON public.sop_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage sop_documents"
  ON public.sop_documents FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- 7. Storage bucket for cleaner onboarding documents (id, police check)
--    Reuses the existing 'staff-documents' bucket if present, but ensures it
--    exists and ensures cleaners can upload during the authenticated flow.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-documents', 'staff-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to staff-documents (for /cleaner-onboarding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated upload to staff-documents'
  ) THEN
    CREATE POLICY "Authenticated upload to staff-documents"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'staff-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read staff-documents'
  ) THEN
    CREATE POLICY "Public read staff-documents"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'staff-documents');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 8. SOP knowledge base — seed the four required SOPs
-- ----------------------------------------------------------------------------
INSERT INTO public.sop_documents (title, sop_code, category, content) VALUES
(
  'Cleaner Onboarding & Training SOP',
  'B-ABNB-HR-002',
  'HR',
  $sop$ABOUT BRIGHTLY
Brightly provides professional cleaning services for Airbnb and short-stay rental properties on the Gold Coast. Hotel-quality presentation on every clean.

YOUR ENGAGEMENT
Independent contractor — paid per job or agreed hourly rate. Must hold a valid ABN (free at abr.gov.au). Responsible for own GST and income tax.

PRE-START CHECKLIST (must be complete before solo deployment)
- ABN provided
- Bank details provided
- Emergency contact provided
- ID verified (driver licence or passport)
- Police check completed
- Master Cleaning SOP (B-ABNB-SOP-004) read and signed
- Linen & Laundry SOP (B-ABNB-SOP-005) read and signed
- Chemical safety induction signed
- Connecteam set up
- Kit issued
- Two shadow cleans completed (Score 80%+ on Shadow 2)
- Director sign-off

INDUCTION PROCESS
1. Welcome & Intro with Brendan Parker
2. SOP Review & Knowledge Check
3. Chemical Safety Induction — never mix bleach with ammonia. Mandatory PPE: rubber gloves; safety glasses when spraying overhead. SDS available from Brendan on request.

SEQUENCE OF CLEAN
1. Arrive: confirm vacant, entry photo, walk-through, report damage
2. Strip beds, towels, bins; bag linen for hire supplier
3. Kitchen first
4. Bathrooms
5. Bedrooms — make beds with fresh hire linen
6. Living areas
7. Final check + photo every room + lock up + submit job

NON-NEGOTIABLES
- Hotel-fold linen, wrinkle-free
- Bathrooms: streak-free glass, no hair, sanitised
- Kitchen: benches/stove/sink/floor clean and dry
- Restock all consumables (toilet paper, soap, shampoo, conditioner)
- Lock windows, lights off, door secured
- Photos of every room before marking complete

LINEN HANDLING (RENTED MODEL)
Brightly uses rented linen — you do NOT wash or store linen. Strip used linen into hire bags, tag stained items, never discard hire linen, place dirty bag at agreed collection point. If linen has not arrived: CALL OFFICE — DO NOT BEGIN CLEAN.

SHADOW CLEAN PROCEDURE
Two supervised shadows minimum. Shadow 2 must score 80%+ on QC audit.

ONGOING TRAINING TRIGGERS
- QC audit below 70% → mandatory re-training before next solo job
- 3 audits below 80% in 60 days → formal performance review and re-shadow
- Guest complaint → review within 48 hours
- New property type → briefing required
- 30+ days off roster → refresher walkthrough

PERFORMANCE EXPECTATIONS
Arrive on time. Complete every checklist item. Photos for every job before marking complete (no photos = no payment processed). Professional appearance, no smoking/eating/personal calls during cleaning time.

REMOVAL OFFENCES
Theft, no-show without notice, sharing access codes, persistent QC failures after retraining, aggressive conduct, breach of confidentiality.

WHS — REQUIRED PPE
- Rubber gloves at all times when handling chemicals or cleaning bathrooms/kitchens
- Safety glasses when spraying above shoulder
- Closed-toe slip-resistant footwear

CHEMICAL SAFETY
Never mix chemicals. Never use bleach with ammonia. If chemical contacts skin or eyes: rinse immediately with running water for 15+ minutes, then seek medical advice.

INCIDENT REPORTING
1. Call 000 if life-threatening
2. Notify Brendan Parker: 0418 878 707
3. Brendan notifies WorkSafe QLD (1300 362 128) if required
4. Complete incident report within 24 hours

EMERGENCY CONTACTS
Brendan Parker / Office: 0418 878 707
Emergency: 000
Poisons: 13 11 26
WorkSafe QLD: 1300 362 128$sop$
),
(
  'Staff Roles & Responsibilities Overview',
  'B-ABNB-HR-001',
  'HR',
  $sop$DIRECTOR / OPERATIONS LEAD — Brendan Parker | 0418 878 707
Final sign-off on new property onboarding and client contracts. Manages invoicing in Xero. Primary escalation for incidents, complaints, damage. Manages contractor agreements.

HEAD CLEANER — Jessica Cowell
First point of contact for on-ground operational issues. Attends all new property first cleans. Responsible for training and quality oversight of all cleaning contractors. Manages central consumables stock. Reviews job completions and photo submissions for quality compliance.

CLEANING CONTRACTOR
Completes assigned cleans per Connecteam schedule. Follows all Brightly SOPs — no exceptions. Submits before/after photos via Connecteam every job. Reports damage, maintenance faults, or access issues immediately. Responsible for own equipment and chemical kit.

ESCALATION CHAIN
On-the-job issue → Head Cleaner → Brendan Parker
All urgent (damage, access failure, guest-ready risk) → Brendan Parker directly: 0418 878 707$sop$
),
(
  'Quality Inspection & Signoff SOP',
  'B-COM-SOP-004',
  'QC',
  $sop$PURPOSE
Defines pre-handover quality inspection. Every job must pass a full supervisor walkthrough before client sign-off. No job leaves Brightly without a documented pass.

WHO INSPECTS
Only a Brightly supervisor or team leader. Cleaners do not self-inspect their own work. The person who cleaned a room is never the person who signs it off.

ROOM-BY-ROOM CHECKLIST — WHAT TO LOOK FOR
- Streaks on glass, mirrors, benchtops (eye-level, against natural light)
- Dust on horizontal surfaces — finger-test skirting boards, sills, shelf tops
- Paint overspray (post-construction)
- Sticker residue
- Smears or fingerprints on stainless or polished surfaces
- Water spots on tapware/glass (indicates not dried)
- Debris in corners, behind doors, under fixtures
- Scuff marks from cleaning equipment

PASS / FAIL
PASS = every item meets Brightly standard.
FAIL = any single item below standard. A single fail = entire inspection fails until rectified.

ON FAIL
1. Identify defect, photograph if needed
2. Direct cleaner responsible to re-clean immediately
3. Supervisor re-inspects after re-clean
4. Do not invite client for walkthrough until everything passes

CLIENT SIGN-OFF
1. Once supervisor satisfied → invite client/representative for walkthrough
2. Walk every room with client at their pace
3. Address any issues on the spot before sign-off
4. Both parties sign Quality Inspection Sign-Off form
5. Photo/copy sent to client within 24 hours

DOCUMENT RETENTION
All sign-off forms photographed and uploaded to job file same day. Originals filed within 48 hours. Records retained 2 years minimum. Failed inspection records kept alongside final pass record.

ESCALATION
Quality disputes → Brendan Parker — 0418 878 707$sop$
),
(
  'Training Syllabus',
  'B-SHARED-HR-003',
  'Training',
  $sop$PURPOSE
Complete onboarding training program for all new Brightly staff. Every module must be completed before solo deployment. 2–3 days of training combining theory and practical.

CORE MODULES — ALL STAFF (DAY 1)
MODULE 1 — COMPANY INDUCTION (2 HRS)
- Company values, quality standards
- Code of Conduct, communication, uniform, punctuality
- Org chart, who reports to who
- How to use job sheets, checklists, documentation
- Emergency contacts and procedures

MODULE 2 — WHS & SAFETY (3 HRS)
- WHS obligations under QLD Work Health and Safety Act 2011
- Manual handling
- Chemical safety: read SDS, never mix chemicals, correct storage, dilution, PPE
- Hazard identification and reporting
- Incident reporting

AIRBNB STREAM (DAY 2)
MODULE 3A — PROPERTY STANDARDS (3 HRS)
- Turnover sequence: arrival check → strip → kitchen → bathrooms → bedrooms → living → final check
- Hotel-quality presentation: linen folds, streak-free glass, restocking
- Linen handling — rented model
- Consumables restocking
- Property notes and guest expectations

MODULE 4A — GUEST & HOST COMMUNICATION (2 HRS)
- Check-in/out
- Handling guest issues, escalation
- Host reporting (damage, maintenance, restocking)
- Connecteam, WhatsApp protocols

MODULE 5A — PRACTICAL ASSESSMENT (3 HRS)
- Supervised turnover clean
- Marked against quality checklist — every item must pass
- Common fails: linen, hair, streaky glass, missed consumables

ASSESSMENT
Pass on ALL checklist items required before solo deployment. Staff who do not pass are not deployed until competency demonstrated.$sop$
)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9. updated_at trigger helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleaner_onboarding_updated_at ON public.cleaner_onboarding;
CREATE TRIGGER trg_cleaner_onboarding_updated_at
  BEFORE UPDATE ON public.cleaner_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_cleaner_availability_updated_at ON public.cleaner_availability;
CREATE TRIGGER trg_cleaner_availability_updated_at
  BEFORE UPDATE ON public.cleaner_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_job_room_completions_updated_at ON public.job_room_completions;
CREATE TRIGGER trg_job_room_completions_updated_at
  BEFORE UPDATE ON public.job_room_completions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sop_documents_updated_at ON public.sop_documents;
CREATE TRIGGER trg_sop_documents_updated_at
  BEFORE UPDATE ON public.sop_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
