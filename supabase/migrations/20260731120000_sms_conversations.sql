-- ============================================================================
-- SMS CONVERSATIONS — Jess's memory
--
-- Inbound texts used to be matched against a single pending YES/NO action, and
-- anything else got "we couldn't match it to a pending action". No memory, no
-- identity, no conversation.
--
-- This stores every message in and out, keyed by phone, so Jess can answer in
-- context and the office has a full audit trail of what was said to a customer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- E.164, the one stable key we always have for both sides.
  phone       text NOT NULL,
  direction   text NOT NULL CHECK (direction IN ('in', 'out')),
  body        text NOT NULL,

  -- Who the human on the other end is, resolved at write time.
  sender_type text CHECK (sender_type IN ('lead', 'client', 'staff', 'jess', 'admin', 'unknown')),
  profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lead_id     uuid REFERENCES public.quote_requests(id) ON DELETE SET NULL,

  -- True when Jess handed the question to a human instead of answering.
  escalated   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_conversations_phone_idx
  ON public.sms_conversations (phone, created_at DESC);

ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;

-- Edge functions use the service role and bypass RLS. Admins can read the
-- history in-app; nobody else has an access path.
CREATE POLICY "Admins can read sms conversations"
  ON public.sms_conversations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.sms_conversations IS
  'Every SMS in and out, so Jess can hold a conversation with context and the office can audit what was said.';
