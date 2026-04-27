-- Property change requests
--
-- Clients edit a small set of "passport" fields from the portal —
-- access codes, parking notes, special instructions, etc — but those
-- changes don't go live until an admin approves. This table is the
-- pending queue.
--
-- Pattern follows time_edit_requests (cleaner-side change requests):
--   pending → admin decides → approved (writes to properties) | rejected
--
-- Approval is performed by an edge function `decide-property-change`
-- which transitions status + writes the new value to `properties` in
-- the same transaction (well, two awaited writes — close enough for
-- this volume).

CREATE TABLE IF NOT EXISTS public.property_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  -- The properties.<field_name> column being changed. Server validates
  -- against an allow-list — clients can't request changes to e.g.
  -- billing_email or status.
  field_name TEXT NOT NULL,
  -- Value-as-text: covers our allow-listed columns (all text/varchar).
  -- Snapshot of properties.<field_name> when the request was filed, so
  -- the admin sees what would change.
  current_value TEXT,
  new_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_change_requests_property
  ON public.property_change_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_property_change_requests_pending
  ON public.property_change_requests(status)
  WHERE status = 'pending';

ALTER TABLE public.property_change_requests ENABLE ROW LEVEL SECURITY;

-- Admins can do anything. Edge functions use service-role and bypass
-- RLS, so client portal writes (which are tokened, not authed) go via
-- request-property-change.
CREATE POLICY "Admins manage property change requests"
  ON public.property_change_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Authed clients (e.g. those who logged in via the SMS magic-login,
-- which DOES create an auth session) can view their own requests so
-- the portal can show pending status without an extra service-role
-- round-trip.
CREATE POLICY "Clients view own property change requests"
  ON public.property_change_requests
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Register the new event type so the notification UI knows how to
-- render it. Tier = 'important' — admin should see this on the
-- alerts list, but it's not critical (no clean is blocked).
-- Production's alert_tiers may or may not have a unique constraint
-- on event_type depending on when it was created — use a NOT EXISTS
-- check rather than ON CONFLICT to be safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.alert_tiers WHERE event_type = 'property_change_requested') THEN
    INSERT INTO public.alert_tiers (event_type, tier)
    VALUES ('property_change_requested', 'important');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'alert_tiers seed skipped: %', SQLERRM;
END $$;
