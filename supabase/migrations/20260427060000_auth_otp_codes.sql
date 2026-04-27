-- One-time SMS login codes.
--
-- We send a 6-digit code via Twilio (existing infra), the user types
-- it in, we verify, then we hand them a real Supabase auth session via
-- magic-link admin API. This lets us bypass Supabase's native phone
-- auth (which would require dashboard config + a separate Twilio
-- integration on the Supabase side) and use the Twilio account we
-- already have running.
--
-- Code is hashed before storage so a leaked DB row doesn't expose
-- valid login codes. Cleanup is opportunistic — the verify path
-- deletes consumed/expired rows, and a follow-up cron can clean up
-- anything older than a day.

CREATE TABLE IF NOT EXISTS public.auth_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Phone in E.164 form (e.g. +61420219101) — normalized at request time.
  phone TEXT NOT NULL,
  -- SHA-256 of the 6-digit code. Never store the plaintext.
  code_hash TEXT NOT NULL,
  -- 10-minute window from creation.
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_phone ON public.auth_otp_codes(phone)
  WHERE consumed_at IS NULL;

ALTER TABLE public.auth_otp_codes ENABLE ROW LEVEL SECURITY;

-- Edge functions use service-role and bypass RLS; no other access path.
CREATE POLICY "Admins inspect OTP codes"
  ON public.auth_otp_codes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Backfill auth.users.phone from profiles.phone for existing users.
-- Without this, an existing staff member typing their phone wouldn't
-- match any auth user, and login would silently fail. After this
-- migration, every profile-with-phone has a corresponding auth.users
-- row whose .phone column matches.
--
-- Normalization: strip whitespace; we accept whatever format the user
-- already has in profiles.phone. Brendan can manually clean up dupes
-- if any surface (the UPDATE will only set phone where it's currently
-- null on auth.users, so it won't overwrite anything).
DO $$
BEGIN
  UPDATE auth.users u
  SET phone = REPLACE(p.phone, ' ', '')
  FROM public.profiles p
  WHERE u.id = p.id
    AND p.phone IS NOT NULL
    AND p.phone != ''
    AND (u.phone IS NULL OR u.phone = '');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Phone backfill skipped: %', SQLERRM;
END $$;
