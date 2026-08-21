-- ============================================================================
-- Pull the historical first-touch texts into the conversation
--
-- Leads showed "Contacted" with an empty Texts panel, which looks like the
-- system is lying about having messaged them.
--
-- It was not lying, it just could not see. The old Jess wrote the message it
-- sent into form_data->>'jess_message', a place no screen reads. lead_events
-- was only created today, so it holds nothing from before.
--
-- This copies those messages onto the lead's timeline, keeping the original
-- send time so the thread reads in the right order.
--
-- Inbound replies from before today are NOT recoverable. They were written to
-- sms_conversations, a table that was never created in production, so they
-- were never stored anywhere. Nothing to restore.
-- ============================================================================

INSERT INTO public.lead_events (lead_id, kind, body, to_stage, actor, created_at)
SELECT
  qr.id,
  'sms_out',
  qr.form_data->>'jess_message',
  'contacted',
  'automation',
  COALESCE((qr.form_data->>'jess_first_touch_at')::timestamptz, qr.created_at)
FROM public.quote_requests qr
WHERE qr.form_data->>'jess_message' IS NOT NULL
  -- Safe to run twice: skip anything already on the timeline.
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_events le
     WHERE le.lead_id = qr.id
       AND le.kind = 'sms_out'
       AND le.body = qr.form_data->>'jess_message'
  );
