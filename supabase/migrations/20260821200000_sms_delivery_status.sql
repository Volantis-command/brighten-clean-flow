-- ============================================================================
-- Know whether a text actually ARRIVED
--
-- Twilio returning 201 means "queued", not "delivered". The app treated that
-- as proof of sending, so the thread said sent for a message that may have
-- bounced at the carrier. That is the same class of lie as the old
-- "Contacted" flag, and just as misleading.
--
-- Twilio will call us back as the message moves through queued, sent,
-- delivered, undelivered or failed. These columns hold that.
-- ============================================================================

ALTER TABLE public.lead_events
  ADD COLUMN IF NOT EXISTS twilio_sid text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS error_code text;

CREATE INDEX IF NOT EXISTS lead_events_twilio_sid_idx
  ON public.lead_events (twilio_sid) WHERE twilio_sid IS NOT NULL;

COMMENT ON COLUMN public.lead_events.delivery_status IS
  'What Twilio says happened: queued, sent, delivered, undelivered, failed. Anything other than delivered means the customer may not have it.';
