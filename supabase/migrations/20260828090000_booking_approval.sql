-- ============================================================================
-- CLIENT BOOKINGS LAND ON THE CALENDAR, PENDING YOUR APPROVAL
--
-- Dean asked to book 28 Aug 9am. All that happened was a text to BJ and a lead
-- in the app. Nothing appeared on the calendar, so if the text was missed, the
-- request was invisible. And because no job existed, the slot was not held:
-- someone else could have booked the same time while it sat unanswered.
--
-- A client booking now creates a REAL job immediately, marked pending. That
-- means it shows on the calendar and, because the availability engine counts
-- every non-cancelled job, it holds the slot from the moment they ask.
--
-- approval_status is separate from status on purpose. status tracks the work
-- (needs a cleaner, confirmed, in progress). approval_status tracks whether BJ
-- has agreed to it at all. Overloading status would have broken the 205 jobs
-- already sitting in awaiting_cleaner_acceptance.
-- ============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at           timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_approval_status_check') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_approval_status_check
      CHECK (approval_status IN ('approved', 'pending', 'change_requested'));
  END IF;
END $$;

-- Everything that already exists was put there by BJ or Jess, so it is approved
-- by definition. The default handles that, this is belt and braces.
UPDATE public.jobs SET approval_status = 'approved' WHERE approval_status IS NULL;

CREATE INDEX IF NOT EXISTS jobs_pending_approval_idx
  ON public.jobs (approval_status, scheduled_date)
  WHERE approval_status <> 'approved';

COMMENT ON COLUMN public.jobs.approval_status IS
  'approved = BJ has agreed to it. pending = a client asked and it is waiting. change_requested = BJ asked them to pick another time. Separate from status, which tracks the work itself.';

-- The client gets told when it is confirmed. Wording BJ owns, like the others.
INSERT INTO public.message_templates (key, name, description, body, tokens) VALUES
  ('booking_approved',
   'Booking approved',
   'Sent when a client booking request is approved and locked into the calendar.',
   'Good news {first_name}, your clean is confirmed for {date} at {time}. We will text you the morning of the clean. Any changes, just reply here.',
   ARRAY['first_name','date','time','address','price']),
  ('booking_change_requested',
   'Ask the client for a different time',
   'Sent when the requested time does not work. Includes a link to pick another, showing only times we can actually do.',
   'Hi {first_name}, sorry, we cannot make {date} at {time}. Here are the times we can do, pick whichever suits: {booking_link}',
   ARRAY['first_name','date','time','booking_link'])
ON CONFLICT (key) DO NOTHING;
