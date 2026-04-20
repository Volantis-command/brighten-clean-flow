-- Backfill properties for existing clients using data from the QUOTES table.
--
-- The previous migration (20260420180000) used quote_requests. But Brendan's
-- active clients have their property info stored in the quotes table
-- (property_name, property_address, client_phone, bedrooms, bathrooms, etc.)
-- because that's where the admin builds and saves their quote.
--
-- This migration:
--   1. Finds all quotes that have a property_address + client_phone
--   2. Matches the client by phone → profiles
--   3. Creates a property if one doesn't exist at that address
--   4. Links client ↔ property via client_properties
--
-- Also links via quote_requests as a second pass (belt & suspenders).
-- Safe to re-run: checks for existing links, ON CONFLICT DO NOTHING.

-- ═══ Pass 1: From quotes table ═══
DO $$
DECLARE
  q RECORD;
  profile_id UUID;
  prop_id UUID;
  prop_name TEXT;
BEGIN
  FOR q IN
    SELECT DISTINCT ON (client_phone, property_address)
      id, client_name, client_phone, client_email,
      property_address, property_name, clean_type,
      bedrooms, bathrooms, property_id
    FROM public.quotes
    WHERE property_address IS NOT NULL
      AND property_address != ''
      AND client_phone IS NOT NULL
      AND client_phone != ''
    ORDER BY client_phone, property_address, created_at DESC
  LOOP
    -- Find matching profile by phone
    SELECT p.id INTO profile_id
    FROM public.profiles p
    WHERE p.phone = q.client_phone
    LIMIT 1;

    -- Try email if phone didn't match
    IF profile_id IS NULL AND q.client_email IS NOT NULL AND q.client_email != '' THEN
      SELECT p.id INTO profile_id
      FROM public.profiles p
      WHERE p.email = q.client_email
      LIMIT 1;
    END IF;

    IF profile_id IS NULL THEN
      CONTINUE; -- no profile found, skip
    END IF;

    -- Check if this client already has a property at this address
    PERFORM 1
    FROM public.client_properties cp
    JOIN public.properties pr ON pr.id = cp.property_id
    WHERE cp.client_id = profile_id
      AND LOWER(TRIM(pr.address)) = LOWER(TRIM(q.property_address));
    IF FOUND THEN
      CONTINUE; -- already linked
    END IF;

    -- Use existing property_id from the quote if it's set and valid
    IF q.property_id IS NOT NULL THEN
      SELECT pr.id INTO prop_id
      FROM public.properties pr
      WHERE pr.id = q.property_id;
    END IF;

    -- Otherwise find by address
    IF prop_id IS NULL THEN
      SELECT pr.id INTO prop_id
      FROM public.properties pr
      WHERE LOWER(TRIM(pr.address)) = LOWER(TRIM(q.property_address))
      LIMIT 1;
    END IF;

    -- Create if not found
    IF prop_id IS NULL THEN
      prop_name := COALESCE(
        NULLIF(TRIM(q.property_name), ''),
        SPLIT_PART(COALESCE(q.client_name, q.property_address), ' ', 1) || '''s Property'
      );

      INSERT INTO public.properties (
        property_name, address, client_name, client_type, status,
        bedrooms, bathrooms
      ) VALUES (
        prop_name,
        q.property_address,
        q.client_name,
        CASE WHEN LOWER(COALESCE(q.clean_type, '')) LIKE '%airbnb%' THEN 'airbnb' ELSE 'residential' END,
        'active',
        q.bedrooms,
        q.bathrooms
      )
      RETURNING id INTO prop_id;
    ELSE
      -- Update existing property with any missing data from the quote
      UPDATE public.properties SET
        client_name = COALESCE(client_name, q.client_name),
        bedrooms = COALESCE(bedrooms, q.bedrooms),
        bathrooms = COALESCE(bathrooms, q.bathrooms),
        property_name = COALESCE(
          NULLIF(property_name, ''),
          NULLIF(TRIM(q.property_name), ''),
          SPLIT_PART(COALESCE(q.client_name, ''), ' ', 1) || '''s Property'
        )
      WHERE id = prop_id;
    END IF;

    -- Link
    INSERT INTO public.client_properties (client_id, property_id, property_address, property_name)
    VALUES (
      profile_id,
      prop_id,
      q.property_address,
      (SELECT property_name FROM public.properties WHERE id = prop_id)
    )
    ON CONFLICT (client_id, property_id) DO NOTHING;

    -- Also update the quote's property_id if it was null
    IF q.property_id IS NULL THEN
      UPDATE public.quotes SET property_id = prop_id WHERE id = q.id;
    END IF;

    RAISE NOTICE 'Linked % (%) to property % at %', q.client_name, profile_id, prop_id, q.property_address;
  END LOOP;
END $$;

-- ═══ Pass 2: From quote_requests table (catches any the previous migration missed) ═══
DO $$
DECLARE
  qr RECORD;
  profile_id UUID;
  prop_id UUID;
  prop_name TEXT;
BEGIN
  FOR qr IN
    SELECT DISTINCT ON (phone, address)
      id, first_name, last_name, phone, email, address, clean_type
    FROM public.quote_requests
    WHERE address IS NOT NULL AND address != ''
      AND phone IS NOT NULL AND phone != ''
    ORDER BY phone, address, created_at DESC
  LOOP
    SELECT p.id INTO profile_id
    FROM public.profiles p WHERE p.phone = qr.phone LIMIT 1;

    IF profile_id IS NULL AND qr.email IS NOT NULL THEN
      SELECT p.id INTO profile_id
      FROM public.profiles p WHERE p.email = qr.email LIMIT 1;
    END IF;

    IF profile_id IS NULL THEN CONTINUE; END IF;

    -- Already linked?
    PERFORM 1
    FROM public.client_properties cp
    JOIN public.properties pr ON pr.id = cp.property_id
    WHERE cp.client_id = profile_id
      AND LOWER(TRIM(pr.address)) = LOWER(TRIM(qr.address));
    IF FOUND THEN CONTINUE; END IF;

    -- Find or create
    SELECT pr.id INTO prop_id
    FROM public.properties pr
    WHERE LOWER(TRIM(pr.address)) = LOWER(TRIM(qr.address))
    LIMIT 1;

    IF prop_id IS NULL THEN
      prop_name := COALESCE(
        NULLIF(TRIM(COALESCE(qr.first_name, '') || ' ' || COALESCE(qr.last_name, '')), ''),
        qr.address
      );
      prop_name := SPLIT_PART(prop_name, ' ', 1) || '''s Property';

      INSERT INTO public.properties (
        property_name, address, client_name, client_type, status
      ) VALUES (
        prop_name, qr.address,
        TRIM(COALESCE(qr.first_name, '') || ' ' || COALESCE(qr.last_name, '')),
        CASE WHEN LOWER(COALESCE(qr.clean_type, '')) LIKE '%airbnb%' THEN 'airbnb' ELSE 'residential' END,
        'onboarding'
      )
      RETURNING id INTO prop_id;
    END IF;

    INSERT INTO public.client_properties (client_id, property_id, property_address, property_name)
    VALUES (
      profile_id, prop_id, qr.address,
      (SELECT property_name FROM public.properties WHERE id = prop_id)
    )
    ON CONFLICT (client_id, property_id) DO NOTHING;
  END LOOP;
END $$;
