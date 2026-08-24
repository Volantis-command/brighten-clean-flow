-- ============================================================================
-- Jess's memory
--
-- This is why she repeated herself five times to Gemma. jess-reply reads the
-- conversation so far from sms_conversations, and that table has never existed
-- in production. The read was wrapped in a try/catch, so it failed silently and
-- history was ALWAYS empty. Every reply she wrote was, as far as she knew, the
-- first message of the conversation.
--
-- Keyed by phone rather than by lead, so a person keeps one thread whether they
-- are a lead, a client or staff.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  direction   text NOT NULL CHECK (direction IN ('in', 'out')),
  body        text NOT NULL,
  sender_type text CHECK (sender_type IN ('lead','client','staff','jess','admin','unknown')),
  profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lead_id     uuid REFERENCES public.quote_requests(id) ON DELETE SET NULL,
  escalated   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_conversations_phone_idx
  ON public.sms_conversations (phone, created_at DESC);

ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;

-- Edge functions use the service role and bypass RLS. Admins read it in-app.
DROP POLICY IF EXISTS "Admins can read sms conversations" ON public.sms_conversations;
CREATE POLICY "Admins can read sms conversations"
  ON public.sms_conversations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed the threads we already have, so Jess is not amnesiac about conversations
-- that happened before this table existed.
INSERT INTO public.sms_conversations (phone, direction, body, sender_type, lead_id, created_at)
SELECT qr.phone,
       CASE WHEN le.kind = 'sms_in' THEN 'in' ELSE 'out' END,
       le.body,
       CASE WHEN le.kind = 'sms_in' THEN 'lead' ELSE 'jess' END,
       le.lead_id,
       le.created_at
  FROM public.lead_events le
  JOIN public.quote_requests qr ON qr.id = le.lead_id
 WHERE le.kind IN ('sms_in', 'sms_out')
   AND le.body IS NOT NULL
   AND qr.phone IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.sms_conversations sc
      WHERE sc.phone = qr.phone AND sc.body = le.body
   );

COMMENT ON TABLE public.sms_conversations IS
  'Every SMS in and out, keyed by phone. Jess reads this as the conversation so far. If it is empty she has no memory and will repeat herself.';

-- ── The first text now comes from Jess, not Brendan ────────────────────────
-- The template said "Brendan here", then Jess replied to the answer and had to
-- correct herself: "I'm actually Jess, Brightly's assistant." Confusing, and it
-- burns the first reply on an apology. One voice from the first word.
UPDATE public.message_templates
   SET body = 'Hey {first_name}, Jess here from Brightly Cleaning, thanks for checking us out. Any questions about your quote? Or can we get you locked in for your clean?',
       updated_at = now()
 WHERE key = 'lead_first_touch';
