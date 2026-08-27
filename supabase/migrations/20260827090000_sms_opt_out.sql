-- ============================================================================
-- Let people say stop, and mean it
--
-- Lynn asked us to stop texting her the rating request. She could not, because
-- THERE WAS NO WAY TO OPT OUT. Nothing in the system could record that someone
-- does not want messages, so the only way to stop was to ask a human, and the
-- automation would have carried on regardless.
--
-- Two faults produced this:
--   1. No opt-out. Not a bug so much as a missing feature, and in Australia a
--      commercial SMS is supposed to carry a working unsubscribe.
--   2. The rating sender only skips a job once feedback_rating_sms_sent_at is
--      set, and that write is not error checked. 15 completed jobs currently
--      have no stamp, so they remain permanently eligible to be sent again.
-- ============================================================================

-- ── 1. The opt-out ─────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_opt_out          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_out_at       timestamptz,
  ADD COLUMN IF NOT EXISTS sms_opt_out_reason   text;

COMMENT ON COLUMN public.profiles.sms_opt_out IS
  'True means send no marketing or feedback SMS. Operational messages about a booked clean still go out. Set by a STOP reply or by an admin.';

-- Lynn asked. Honour it now rather than after the next deploy.
UPDATE public.profiles
   SET sms_opt_out = true,
       sms_opt_out_at = now(),
       sms_opt_out_reason = 'Asked by SMS on 27 Aug 2026 to stop the rating requests'
 WHERE phone LIKE '%499777597%';

-- ── 2. Stop the backlog re-sending ─────────────────────────────────────────
-- Every completed job with no stamp is still eligible. Stamping them closes
-- the door on historical cleans without touching anything upcoming.
UPDATE public.jobs
   SET feedback_rating_sms_sent_at = COALESCE(feedback_rating_sms_sent_at, now())
 WHERE status = 'completed'
   AND feedback_rating_sms_sent_at IS NULL;

-- ── 3. A place to see who has opted out ────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_sms_opt_out_idx
  ON public.profiles (sms_opt_out) WHERE sms_opt_out = true;

-- ── Turn the rating request off for everyone ───────────────────────────────
-- BJ's call: nobody receives it for now. A setting, not a code change, so it
-- can be turned back on without a deploy. The rebook nudge is untouched.
INSERT INTO public.notification_settings (key, enabled)
VALUES ('send_rating_sms', false)
ON CONFLICT (key) DO UPDATE SET enabled = false;
