-- Backfill follow-up to PR #80 / #79.
--
-- Problem: properties created before link-intake-to-profile was reliable
-- have client_name / billing_email / client_phone populated on the
-- properties row itself, but no row in client_properties. The admin
-- ClientsPage synthesizes a fake client entry for these so they show up
-- in admin (see src/pages/ClientsPage.tsx ~line 97), but the client
-- portal queries client_properties directly, so the real client never
-- sees their property when they log in.
--
-- This migration walks every property that has any client identifier
-- (phone / email / name), tries to match it to an existing profile, and
-- inserts a client_properties row if none exists yet.
--
-- Match priority (most reliable first):
--   1. Phone (normalized — strip whitespace)
--   2. Email (lowercased + trimmed)
--   3. Full name (lowercased + trimmed) — only if exactly ONE profile
--      matches, to avoid linking the wrong person when two clients share
--      a name.
--
-- Safe to re-run: ON CONFLICT DO NOTHING on the unique (client_id, property_id).

DO $$
DECLARE
  prop RECORD;
  matched_profile UUID;
  name_match_count INT;
BEGIN
  FOR prop IN
    SELECT id, property_name, client_name, billing_email, client_phone
    FROM public.properties
    WHERE client_name IS NOT NULL
       OR billing_email IS NOT NULL
       OR client_phone IS NOT NULL
  LOOP
    -- Skip if this property is already linked to anyone.
    IF EXISTS (
      SELECT 1 FROM public.client_properties WHERE property_id = prop.id
    ) THEN
      CONTINUE;
    END IF;

    matched_profile := NULL;

    -- 1. Match by phone (most reliable).
    IF prop.client_phone IS NOT NULL AND prop.client_phone != '' THEN
      SELECT p.id INTO matched_profile
      FROM public.profiles p
      WHERE REPLACE(p.phone, ' ', '') = REPLACE(prop.client_phone, ' ', '')
      LIMIT 1;
    END IF;

    -- 2. Match by email.
    IF matched_profile IS NULL
       AND prop.billing_email IS NOT NULL
       AND prop.billing_email != '' THEN
      SELECT p.id INTO matched_profile
      FROM public.profiles p
      WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(prop.billing_email))
      LIMIT 1;
    END IF;

    -- 3. Match by full name — only if unambiguous.
    IF matched_profile IS NULL
       AND prop.client_name IS NOT NULL
       AND prop.client_name != '' THEN
      SELECT COUNT(*) INTO name_match_count
      FROM public.profiles p
      WHERE LOWER(TRIM(p.full_name)) = LOWER(TRIM(prop.client_name));

      IF name_match_count = 1 THEN
        SELECT p.id INTO matched_profile
        FROM public.profiles p
        WHERE LOWER(TRIM(p.full_name)) = LOWER(TRIM(prop.client_name))
        LIMIT 1;
      ELSIF name_match_count > 1 THEN
        RAISE NOTICE 'Skipping property % (%) — % profiles match name "%"',
          prop.id, prop.property_name, name_match_count, prop.client_name;
      END IF;
    END IF;

    IF matched_profile IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.client_properties (client_id, property_id)
    VALUES (matched_profile, prop.id)
    ON CONFLICT (client_id, property_id) DO NOTHING;

    RAISE NOTICE 'Linked property % (%) to profile %', prop.id, prop.property_name, matched_profile;
  END LOOP;
END $$;
