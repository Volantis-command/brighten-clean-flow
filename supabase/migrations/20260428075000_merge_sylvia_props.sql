-- Merge two duplicate "Sylvia" property records into one.
-- Each column copy is in its own EXCEPTION block — if a column doesn't
-- exist on this DB it gets skipped, doesn't kill the whole merge.

DO $$
DECLARE
  KEEP_ID UUID := '17027bd4-81b8-4028-8eb0-a371bf59d3c2';
  DROP_ID UUID := 'dff0b48d-4c3c-4a52-8a61-64e0b94fd76d';
BEGIN
  -- Always-present columns from the original schema.
  UPDATE public.properties tgt SET
    property_name = 'Sylvia''s Property',
    access_method = COALESCE(NULLIF(NULLIF(tgt.access_method, 'Other'), ''), src.access_method),
    access_code = COALESCE(NULLIF(tgt.access_code, ''), src.access_code),
    alarm_code = COALESCE(NULLIF(tgt.alarm_code, ''), src.alarm_code),
    access_notes = COALESCE(NULLIF(tgt.access_notes, ''), src.access_notes),
    client_name = COALESCE(NULLIF(tgt.client_name, ''), src.client_name),
    billing_email = COALESCE(NULLIF(tgt.billing_email, ''), src.billing_email),
    bedrooms = COALESCE(NULLIF(tgt.bedrooms, 0), src.bedrooms),
    bathrooms = COALESCE(NULLIF(tgt.bathrooms, 0), src.bathrooms),
    client_type = COALESCE(NULLIF(tgt.client_type, ''), src.client_type)
  FROM public.properties src
  WHERE tgt.id = KEEP_ID AND src.id = DROP_ID;
  RAISE NOTICE 'Core fields merged.';

  -- Optional columns — each in its own EXCEPTION block so unknown
  -- columns are skipped silently.
  BEGIN EXECUTE format('UPDATE public.properties SET garage_code = COALESCE(NULLIF(garage_code, %L), (SELECT garage_code FROM public.properties WHERE id = %L)) WHERE id = %L', '', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'garage_code skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET client_phone = COALESCE(NULLIF(client_phone, %L), (SELECT client_phone FROM public.properties WHERE id = %L)) WHERE id = %L', '', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'client_phone skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET hero_image_url = COALESCE(hero_image_url, (SELECT hero_image_url FROM public.properties WHERE id = %L)) WHERE id = %L', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'hero_image_url skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET hostaway_listing_id = COALESCE(hostaway_listing_id, (SELECT hostaway_listing_id FROM public.properties WHERE id = %L)) WHERE id = %L', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'hostaway_listing_id skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET ical_url = COALESCE(ical_url, (SELECT ical_url FROM public.properties WHERE id = %L)) WHERE id = %L', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ical_url skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET parking_notes = COALESCE(NULLIF(parking_notes, %L), (SELECT parking_notes FROM public.properties WHERE id = %L)) WHERE id = %L', '', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'parking_notes skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET special_instructions = COALESCE(NULLIF(special_instructions, %L), (SELECT special_instructions FROM public.properties WHERE id = %L)) WHERE id = %L', '', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'special_instructions skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET preferences_notes = COALESCE(NULLIF(preferences_notes, %L), (SELECT preferences_notes FROM public.properties WHERE id = %L)) WHERE id = %L', '', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'preferences_notes skipped: %', SQLERRM; END;
  BEGIN EXECUTE format('UPDATE public.properties SET host_preferences = COALESCE(NULLIF(host_preferences, %L), (SELECT host_preferences FROM public.properties WHERE id = %L)) WHERE id = %L', '', DROP_ID, KEEP_ID); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'host_preferences skipped: %', SQLERRM; END;

  -- Repoint client_properties (de-dup with conflict).
  BEGIN
    UPDATE public.client_properties SET property_id = KEEP_ID
    WHERE property_id = DROP_ID
      AND NOT EXISTS (
        SELECT 1 FROM public.client_properties cp2
        WHERE cp2.property_id = KEEP_ID AND cp2.client_id = client_properties.client_id
      );
    DELETE FROM public.client_properties WHERE property_id = DROP_ID;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'client_properties: %', SQLERRM; END;

  -- Repoint child tables.
  BEGIN UPDATE public.jobs SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'jobs: %', SQLERRM; END;
  BEGIN UPDATE public.photos SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'photos: %', SQLERRM; END;
  BEGIN UPDATE public.qc_audits SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'qc_audits: %', SQLERRM; END;
  BEGIN UPDATE public.property_issues SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'property_issues: %', SQLERRM; END;
  BEGIN UPDATE public.job_feedback SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'job_feedback: %', SQLERRM; END;
  BEGIN UPDATE public.job_series SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'job_series: %', SQLERRM; END;
  BEGIN UPDATE public.property_change_requests SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'property_change_requests: %', SQLERRM; END;
  BEGIN UPDATE public.cleaner_tips SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cleaner_tips: %', SQLERRM; END;
  BEGIN UPDATE public.quotes SET property_id = KEEP_ID WHERE property_id = DROP_ID; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'quotes: %', SQLERRM; END;

  -- Delete the duplicate.
  BEGIN
    DELETE FROM public.properties WHERE id = DROP_ID;
    RAISE NOTICE 'Deleted duplicate %', DROP_ID;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not delete duplicate (FK refs remain): %', SQLERRM;
  END;
END $$;
