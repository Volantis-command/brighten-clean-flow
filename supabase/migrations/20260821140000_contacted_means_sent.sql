-- ============================================================================
-- "Contacted" must mean a message actually went out
--
-- BJ's rule: generating a quote is not contact. Only sending something is.
--
-- The first backfill trusted the old status column, and some of those statuses
-- were set when a quote was BUILT rather than SENT. That put people in
-- Contacted and Quoted who have never heard from us, which is worse than
-- useless: it tells you to stop chasing someone nobody has spoken to.
--
-- Evidence of real contact, any one of:
--   form_data->>'jess_first_touch_at'  the speed-to-lead text sent
--   quote_sent_at                      the quote link was SMSed
--   followup_sent_at                   a follow-up was sent
--   accepted_at                        they accepted, so they clearly got it
-- ============================================================================

-- Record WHEN we last actually sent something, from the best evidence we hold.
UPDATE public.quote_requests
   SET last_contacted_at = GREATEST(
         COALESCE((form_data->>'jess_first_touch_at')::timestamptz, 'epoch'::timestamptz),
         COALESCE(quote_sent_at,    'epoch'::timestamptz),
         COALESCE(followup_sent_at, 'epoch'::timestamptz)
       )
 WHERE last_contacted_at IS NULL
   AND (form_data->>'jess_first_touch_at' IS NOT NULL
        OR quote_sent_at IS NOT NULL
        OR followup_sent_at IS NOT NULL);

-- Anyone sitting past New with no evidence we ever sent them anything goes
-- back to New, because that is the truth: nobody has spoken to them.
UPDATE public.quote_requests
   SET stage = 'new',
       stage_changed_at = COALESCE(stage_changed_at, created_at)
 WHERE stage IN ('contacted', 'in_conversation', 'quoted')
   AND last_contacted_at IS NULL
   AND accepted_at IS NULL
   AND form_data->>'jess_first_touch_at' IS NULL
   AND quote_sent_at IS NULL
   AND followup_sent_at IS NULL;

-- Belt and braces the other way: anyone we demonstrably messaged must be at
-- least Contacted, never New.
UPDATE public.quote_requests
   SET stage = 'contacted'
 WHERE stage = 'new'
   AND last_contacted_at IS NOT NULL;

COMMENT ON COLUMN public.quote_requests.last_contacted_at IS
  'When we last actually SENT this person something. Contacted and every stage above it require this to be set. Building a quote does not count.';
