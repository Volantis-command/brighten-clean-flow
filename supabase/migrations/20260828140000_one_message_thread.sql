-- ============================================================================
-- ONE MESSAGE THREAD PER PERSON
--
-- The problem: there are 26 places in this codebase that send a text, and only
-- two of them record it anywhere. So the Messages tab on a client showed
-- nothing, the lead chat box showed only pipeline texts, and Jess had no idea
-- what the rest of the system had already said to the customer.
--
-- Worse, the client Messages tab's reply box never sent anything at all. It
-- inserted a row into client_messages, toasted "Reply sent", and stopped. No
-- text ever left the building.
--
-- The fix has two halves:
--   1. sms_conversations becomes the single log, keyed by phone, and gains
--      Twilio's own message SID so the same message can never be logged twice.
--   2. sync-twilio-messages pulls the full message list from Twilio every five
--      minutes and upserts it. That catches every one of the 26 senders
--      without touching 26 functions, and it catches anything sent straight
--      from the Twilio console too.
-- ============================================================================

-- ── 1. The log gains delivery state and Twilio's identity for the message ──

ALTER TABLE public.sms_conversations
  ADD COLUMN IF NOT EXISTS twilio_sid      text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS error_code      text;

-- The dedupe key. The sync and the senders both write the same message, and
-- whichever gets there first wins. Partial, because messages logged before
-- this migration have no SID and must not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS sms_conversations_twilio_sid_key
  ON public.sms_conversations (twilio_sid)
  WHERE twilio_sid IS NOT NULL;

COMMENT ON COLUMN public.sms_conversations.twilio_sid IS
  'Twilio''s message SID. The dedupe key between a sender writing the message and the five-minute sync finding it again.';

-- ── 2. Admins already read this table. Head cleaners never should. ──
-- (Policy from the original migration stands; nothing to change.)

-- ── 3. Pull everything from Twilio on a schedule ──

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-twilio-messages-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sync-twilio-messages-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/sync-twilio-messages',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
