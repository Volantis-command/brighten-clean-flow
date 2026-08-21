-- ============================================================================
-- LEAD PIPELINE — one ladder, one list
--
-- Replaces a mess of overlapping state:
--   * quote_requests.status had 8 values, several meaning the same thing
--     ('accepted' vs 'client_accepted', 'quote_sent' vs 'awaiting_client_response')
--   * profiles.lead_stage was a SECOND, unrelated machine deciding the
--     Clients page Active/Leads split, which knew nothing about the first
--   * being texted by Jess was recorded only inside form_data, so a lead that
--     had been contacted still read "price_viewed"
--
-- One column now tells the whole story: quote_requests.stage.
--
--   new             just arrived, nobody has spoken to them
--   contacted       our first-touch text actually SENT
--   in_conversation they replied, so a human answer is owed
--   quoted          a quote is out with them
--   booked          a clean is in the calendar
--   won             that clean was completed
--   lost            not proceeding
--
-- status is left in place and still written, so nothing that reads it breaks
-- while the new screens roll out. stage is the source of truth from here.
-- ============================================================================

-- ── 1. The ladder ──────────────────────────────────────────────────────────
ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new',
  -- When we last sent them something. Drives "how long since we touched this".
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  -- Set when THEY message us, cleared when we answer. This is the "needs reply"
  -- queue: any row with this set is owed a human response.
  ADD COLUMN IF NOT EXISTS needs_reply_at timestamptz,
  -- Pipedrive's best idea: an open lead should always have a next action.
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_note text,
  -- When the stage last moved, so a card can go red for sitting still.
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lost_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_requests_stage_check') THEN
    ALTER TABLE public.quote_requests ADD CONSTRAINT quote_requests_stage_check
      CHECK (stage IN ('new','contacted','in_conversation','quoted','booked','won','lost'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quote_requests_stage_idx ON public.quote_requests (stage, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_requests_needs_reply_idx ON public.quote_requests (needs_reply_at) WHERE needs_reply_at IS NOT NULL;

-- ── 2. Backfill from the old statuses ──────────────────────────────────────
-- Order matters: later statements win, so the strongest signal is applied last.
UPDATE public.quote_requests SET stage = 'new'             WHERE status IN ('new','price_viewed');
UPDATE public.quote_requests SET stage = 'in_conversation' WHERE status = 'info_requested';
UPDATE public.quote_requests SET stage = 'quoted'          WHERE status IN ('quote_sent','awaiting_client_response','booking_requested','accepted','client_accepted');

-- Anyone Jess already texted has, by definition, been contacted. That fact was
-- only ever recorded inside form_data, which is why the list looked untouched.
UPDATE public.quote_requests
   SET stage = 'contacted',
       last_contacted_at = COALESCE((form_data->>'jess_first_touch_at')::timestamptz, last_contacted_at)
 WHERE stage = 'new'
   AND form_data->>'jess_first_touch_at' IS NOT NULL;

-- A lead with a real clean in the calendar is booked, whatever its status said.
UPDATE public.quote_requests qr SET stage = 'booked'
 WHERE stage <> 'lost'
   AND EXISTS (
     SELECT 1 FROM public.jobs j
      WHERE j.status <> 'cancelled'
        AND j.client_name = TRIM(CONCAT(qr.first_name, ' ', qr.last_name))
   );

UPDATE public.quote_requests SET stage_changed_at = COALESCE(last_status_change, created_at)
 WHERE stage_changed_at IS NULL;

-- ── 3. Message templates BJ owns ───────────────────────────────────────────
-- The words that go to customers belong to BJ, not to the codebase. Editable
-- in Settings, no deploy needed.
CREATE TABLE IF NOT EXISTS public.message_templates (
  key         text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  body        text NOT NULL,
  -- Placeholders this template may use, shown as buttons in the editor.
  tokens      text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage message templates"
  ON public.message_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.message_templates (key, name, description, body, tokens) VALUES
  ('lead_first_touch',
   'First touch (speed to lead)',
   'Sent automatically the moment a lead sees their price. Sending this moves them to Contacted.',
   'Hey {first_name}, Brendan here from Brightly Cleaning, really appreciate you checking us out. Do you have any questions about your quote? Or can we get you locked in for your clean?',
   ARRAY['first_name','price','property_size','clean_type']),
  ('booking_confirmed',
   'Booking confirmed',
   'Sent the moment a clean is booked into the calendar.',
   'Great news {first_name}, your clean is booked for {date} at {time}. We will text you the morning of the clean. Any changes, just reply to this message.',
   ARRAY['first_name','date','time','price','address'])
ON CONFLICT (key) DO NOTHING;

-- ── 4. A real timeline per lead ────────────────────────────────────────────
-- Every automated action is written down, so "why did this move" and "what did
-- we actually send them" are answerable. Without this, an automation that
-- misfires is invisible.
CREATE TABLE IF NOT EXISTS public.lead_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.quote_requests(id) ON DELETE CASCADE,
  kind       text NOT NULL,      -- sms_out, sms_in, stage_change, booked, note, error
  body       text,
  from_stage text,
  to_stage   text,
  actor      text,               -- 'automation', 'jess', or a user id
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_events_lead_idx ON public.lead_events (lead_id, created_at DESC);

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read lead events"
  ON public.lead_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

COMMENT ON COLUMN public.quote_requests.stage IS
  'The single lead ladder: new, contacted, in_conversation, quoted, booked, won, lost. Source of truth. status is legacy and kept in sync only so older screens keep working.';
