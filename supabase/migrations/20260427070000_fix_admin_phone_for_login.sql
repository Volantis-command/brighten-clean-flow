-- One-shot fix for the phone-OTP login: ensure Brendan's admin
-- profile has his phone number set, so phone lookup finds it.
--
-- Background: phone OTP login looks up profiles.phone. Brendan's
-- admin profile didn't have a phone in it; only the "BJ Cleaner"
-- test account did. Result: every phone-OTP login routed to the
-- cleaner profile, no matter what role-ranking logic ran.
--
-- Strategy:
--   * Print the current state to the migration log so we can see
--     what's there.
--   * If there's exactly one admin user, set their profile.phone +
--     auth.users.phone to +61418878707 (Brendan's phone, E.164).
--   * If there's more than one admin, refuse to auto-update —
--     Brendan can specify.
--
-- Idempotent: safe to re-run. UPDATE only writes if values differ.

DO $$
DECLARE
  r RECORD;
  admin_id UUID;
  admin_count INT;
  target_phone TEXT := '+61418878707';
BEGIN
  RAISE NOTICE '=== profiles whose phone resembles 418878707 ===';
  FOR r IN
    SELECT p.id, p.full_name, p.phone,
           ARRAY(SELECT role FROM public.user_roles WHERE user_id = p.id) AS roles
    FROM public.profiles p
    WHERE p.phone IS NOT NULL
      AND REPLACE(REPLACE(p.phone, ' ', ''), '-', '') LIKE '%418878707'
  LOOP
    RAISE NOTICE 'profile id=% name=% phone=% roles=%',
      r.id, r.full_name, r.phone, r.roles;
  END LOOP;

  RAISE NOTICE '=== all admin users ===';
  FOR r IN
    SELECT p.id, p.full_name, p.phone
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE ur.role = 'admin'
  LOOP
    RAISE NOTICE 'admin id=% name=% phone=%', r.id, r.full_name, r.phone;
  END LOOP;

  SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count = 1 THEN
    SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin';
    UPDATE public.profiles SET phone = target_phone WHERE id = admin_id AND COALESCE(phone, '') <> target_phone;
    BEGIN
      UPDATE auth.users SET phone = REPLACE(target_phone, '+', '') WHERE id = admin_id AND COALESCE(phone, '') <> REPLACE(target_phone, '+', '');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'auth.users phone update skipped: %', SQLERRM;
    END;
    RAISE NOTICE 'Set phone=% on the single admin profile (id=%)', target_phone, admin_id;
  ELSIF admin_count > 1 THEN
    RAISE NOTICE 'Found % admins — refusing to auto-update. Specify which admin manually.', admin_count;
  ELSE
    RAISE NOTICE 'No admin user found at all — cannot fix without one.';
  END IF;
END $$;
