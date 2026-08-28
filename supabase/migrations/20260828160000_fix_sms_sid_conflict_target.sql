-- The unique index on sms_conversations.twilio_sid was created as a partial
-- index (WHERE twilio_sid IS NOT NULL). Postgres will not use a partial index
-- as an ON CONFLICT target unless the statement repeats the same predicate,
-- which PostgREST's upsert does not, so every sync failed with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- A plain unique index is what was wanted all along. Postgres treats NULLs as
-- distinct in a unique index by default, so the rows logged before this column
-- existed, which all have a null SID, do not collide with each other.

DROP INDEX IF EXISTS public.sms_conversations_twilio_sid_key;

CREATE UNIQUE INDEX IF NOT EXISTS sms_conversations_twilio_sid_key
  ON public.sms_conversations (twilio_sid);
