-- One-shot diagnostic: where did Jade's property end up?
-- Pure RAISE NOTICE, no data changes. Output goes to db push log.
DO $$
DECLARE r RECORD; n INT;
BEGIN
  RAISE NOTICE '=== profiles named like Jade ===';
  FOR r IN
    SELECT id, full_name, email, phone FROM public.profiles WHERE full_name ILIKE '%jade%'
  LOOP
    RAISE NOTICE 'profile id=% name=% email=% phone=%',
      r.id, r.full_name, r.email, r.phone;
  END LOOP;

  RAISE NOTICE '=== properties touching Jade (by client_name / email / phone / address) ===';
  FOR r IN
    SELECT id, property_name, address, suburb, client_name, billing_email, client_phone
    FROM public.properties
    WHERE client_name ILIKE '%jade%' OR billing_email ILIKE '%jade%' OR client_phone LIKE '%410527%'
       OR property_name ILIKE '%jade%'
  LOOP
    RAISE NOTICE 'property id=% name="%" addr="% %" client_name=% email=% phone=%',
      r.id, r.property_name, r.address, r.suburb, r.client_name, r.billing_email, r.client_phone;
  END LOOP;

  RAISE NOTICE '=== client_properties links for any Jade profile ===';
  SELECT COUNT(*) INTO n FROM public.client_properties cp
    WHERE cp.client_id IN (SELECT id FROM public.profiles WHERE full_name ILIKE '%jade%');
  IF n = 0 THEN
    RAISE NOTICE '(no client_properties rows linking any Jade profile)';
  ELSE
    FOR r IN
      SELECT cp.id, cp.property_id, p.property_name, cp.portal_token
      FROM public.client_properties cp
      JOIN public.properties p ON p.id = cp.property_id
      WHERE cp.client_id IN (SELECT id FROM public.profiles WHERE full_name ILIKE '%jade%')
    LOOP
      RAISE NOTICE 'cp id=% property_id=% name=% token=%',
        r.id, r.property_id, r.property_name, r.portal_token;
    END LOOP;
  END IF;

  RAISE NOTICE '=== jobs for Jade (by client_name or via Jade properties) ===';
  FOR r IN
    SELECT j.id, j.scheduled_date, j.status, j.property_id, j.client_name
    FROM public.jobs j
    WHERE j.client_name ILIKE '%jade%'
       OR j.property_id IN (SELECT id FROM public.properties WHERE client_name ILIKE '%jade%')
    ORDER BY j.scheduled_date DESC
    LIMIT 10
  LOOP
    RAISE NOTICE 'job id=% date=% status=% property_id=% client_name=%',
      r.id, r.scheduled_date, r.status, r.property_id, r.client_name;
  END LOOP;
END $$;
