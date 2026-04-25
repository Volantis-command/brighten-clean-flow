-- Hostaway integration schema (2026-04-26).
--
-- Brightly is moving to support Hostaway as the primary PMS for
-- Airbnb-management clients (the existing Guesty wiring stays for now
-- but Hostaway is what new clients use, including the 19-property
-- client we're onboarding).
--
-- Per-client connection: each Brightly client (a row in profiles)
-- can authorise their own Hostaway account. Brightly stores the
-- exchanged access token and uses it to:
--   1. Sync property listings from Hostaway
--   2. Receive reservation webhooks
--   3. Auto-create turnover jobs on guest checkout events

-- 1. hostaway_tokens — one row per connected client account
CREATE TABLE IF NOT EXISTS public.hostaway_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Brightly client this Hostaway account belongs to
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Hostaway's account number (returned alongside the token; identifies
  -- which Hostaway account this connection is for)
  hostaway_account_id TEXT NOT NULL,
  -- The bearer token used for API calls. Hostaway's tokens are very
  -- long-lived (~24 months) so we don't need a complex refresh flow.
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  -- The Hostaway client_id used for the auth exchange. Saved so we
  -- can re-exchange a fresh token later without prompting the user.
  hostaway_client_id TEXT,
  -- Last successful sync time (set by listings sync / webhook handlers)
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, hostaway_account_id)
);

ALTER TABLE public.hostaway_tokens ENABLE ROW LEVEL SECURITY;

-- Admin-only access: only admins can read/write Hostaway tokens.
-- (Function-based, no recursion on user_roles.)
DROP POLICY IF EXISTS "Admin full access" ON public.hostaway_tokens;
CREATE POLICY "Admin full access"
  ON public.hostaway_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. properties.hostaway_listing_id — link a Brightly property to a
--    Hostaway listing so reservation events for that listing route to
--    the correct property.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS hostaway_listing_id TEXT;

CREATE INDEX IF NOT EXISTS idx_properties_hostaway_listing_id
  ON public.properties(hostaway_listing_id)
  WHERE hostaway_listing_id IS NOT NULL;

-- 3. updated_at trigger for hostaway_tokens
CREATE OR REPLACE FUNCTION public.set_hostaway_tokens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hostaway_tokens_updated_at ON public.hostaway_tokens;
CREATE TRIGGER trg_hostaway_tokens_updated_at
  BEFORE UPDATE ON public.hostaway_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_hostaway_tokens_updated_at();
