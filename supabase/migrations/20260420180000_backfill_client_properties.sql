-- One-time data fix: create properties + client_properties links for
-- existing clients who came through the intake form before the
-- link-intake-to-profile edge function was working.
--
-- What it does:
--   1. Finds all quote_requests that have an address + phone
--   2. Finds the matching profile (by phone)
--   3. If no property exists for that address linked to that client,
--      creates one and links it via client_properties
--
-- Safe to re-run: checks for existing links before creating.
-- Only touches quote_requests in processed states (not pending/new).

DO $$
DECLARE
  qr RECORD;
  profile_id UUID;
  prop_id UUID;
  prop_name TEXT;
  existing_link UUID;
BEGIN
  FOR qr IN
    SELECT id, first_name, last_name, phone, email, address, clean_type
    FROM public.quote_requests
    WHERE address IS NOT NULL
      AND address != ''
      AND phone IS NOT NULL
      AND phone != ''
      AND status IN ('form_submitted', 'quote_sent', 'accepted', 'scheduled', 'booking_requested', 'booked')
  LOOP
    -- Find matching profile by phone
    SELECT p.id INTO profile_id
    FROM public.profiles p
    WHERE p.phone = qr.phone
    LIMIT 1;

    IF profile_id IS NULL AND qr.email IS NOT NULL AND qr.email != '' THEN
      SELECT p.id INTO profile_id
      FROM public.profiles p
      WHERE p.email = qr.email
      LIMIT 1;
    END IF;

    -- Skip if no profile found (link-intake-to-profile will handle on next interaction)
    IF profile_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Check if this client already has a property at this address
    SELECT cp.property_id INTO existing_link
    FROM public.client_properties cp
    JOIN public.properties pr ON pr.id = cp.property_id
    WHERE cp.client_id = profile_id
      AND LOWER(TRIM(pr.address)) = LOWER(TRIM(qr.address))
    LIMIT 1;

    IF existing_link IS NOT NULL THEN
      CONTINUE; -- already linked, skip
    END IF;

    -- Check if a property with this address already exists (maybe unlinked)
    SELECT pr.id INTO prop_id
    FROM public.properties pr
    WHERE LOWER(TRIM(pr.address)) = LOWER(TRIM(qr.address))
    LIMIT 1;

    -- Create the property if it doesn't exist
    IF prop_id IS NULL THEN
      prop_name := COALESCE(
        NULLIF(TRIM(COALESCE(qr.first_name, '') || ' ' || COALESCE(qr.last_name, '')), ''),
        qr.address
      );
      prop_name := SPLIT_PART(prop_name, ' ', 1) || '''s Property';

      INSERT INTO public.properties (
        property_name, address, client_name,
        client_type, status
      ) VALUES (
        prop_name,
        qr.address,
        TRIM(COALESCE(qr.first_name, '') || ' ' || COALESCE(qr.last_name, '')),
        CASE WHEN LOWER(COALESCE(qr.clean_type, '')) LIKE '%airbnb%' THEN 'airbnb' ELSE 'residential' END,
        'onboarding'
      )
      RETURNING id INTO prop_id;
    END IF;

    -- Link client <-> property
    -- FIXED 2026-04-22: removed property_address/property_name — not on junction table.
    INSERT INTO public.client_properties (client_id, property_id)
    VALUES (profile_id, prop_id)
    ON CONFLICT (client_id, property_id) DO NOTHING;

    RAISE NOTICE 'Linked client % to property % (address: %)', profile_id, prop_id, qr.address;
  END LOOP;
END $$;
