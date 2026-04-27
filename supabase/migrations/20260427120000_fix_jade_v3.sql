-- v3 — only use columns that exist on quote_requests on prod.
DO $$
DECLARE
  qr RECORD;
  job_row RECORD;
  jade_user_id UUID;
  new_property_id UUID;
  pseudo_email TEXT;
  random_password TEXT;
BEGIN
  SELECT id, scheduled_date INTO job_row
  FROM public.jobs
  WHERE client_name ILIKE 'jade%' AND property_id IS NULL
  ORDER BY scheduled_date DESC
  LIMIT 1;
  IF job_row.id IS NULL THEN RAISE NOTICE 'No orphan Jade job.'; RETURN; END IF;

  SELECT id, first_name, last_name, email, phone, address, clean_type
    INTO qr
  FROM public.quote_requests
  WHERE first_name ILIKE 'jade' OR last_name ILIKE 'sharp' OR last_name ILIKE 'sharpe'
  ORDER BY created_at DESC LIMIT 1;
  IF qr.id IS NULL THEN RAISE NOTICE 'No quote.'; RETURN; END IF;

  SELECT id INTO jade_user_id FROM public.profiles
  WHERE full_name ILIKE 'jade%' OR phone = qr.phone OR phone = REPLACE(qr.phone, ' ', '')
  LIMIT 1;
  IF jade_user_id IS NULL THEN
    pseudo_email := REPLACE(REPLACE(COALESCE(qr.phone, ''), ' ', ''), '+', '') || '@client.brightly.cleaning';
    jade_user_id := gen_random_uuid();
    random_password := gen_random_uuid()::text || '!Aa1';
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      jade_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', pseudo_email,
      extensions.crypt(random_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', TRIM(COALESCE(qr.first_name, '') || ' ' || COALESCE(qr.last_name, '')), 'role', 'client'),
      now(), now(), '', '', '', ''
    );
    RAISE NOTICE 'Created auth.users %', jade_user_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (jade_user_id,
          TRIM(COALESCE(qr.first_name, '') || ' ' || COALESCE(qr.last_name, '')),
          NULLIF(qr.email, ''), qr.phone)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

  INSERT INTO public.user_roles (user_id, role) VALUES (jade_user_id, 'client') ON CONFLICT DO NOTHING;

  SELECT id INTO new_property_id FROM public.properties
  WHERE LOWER(TRIM(address)) = LOWER(TRIM(COALESCE(qr.address, ''))) LIMIT 1;
  IF new_property_id IS NULL THEN
    INSERT INTO public.properties (
      property_name, address, client_name, billing_email, client_phone, client_type, status
    ) VALUES (
      COALESCE(NULLIF(qr.first_name, ''), 'Client') || '''s Property',
      qr.address,
      TRIM(COALESCE(qr.first_name, '') || ' ' || COALESCE(qr.last_name, '')),
      NULLIF(qr.email, ''), qr.phone,
      CASE WHEN LOWER(COALESCE(qr.clean_type, '')) LIKE '%airbnb%' THEN 'airbnb' ELSE 'residential' END,
      'active'
    ) RETURNING id INTO new_property_id;
    RAISE NOTICE 'Created property %', new_property_id;
  END IF;

  INSERT INTO public.client_properties (client_id, property_id)
  VALUES (jade_user_id, new_property_id)
  ON CONFLICT (client_id, property_id) DO NOTHING;
  RAISE NOTICE 'Linked';

  UPDATE public.jobs SET property_id = new_property_id WHERE id = job_row.id;
  RAISE NOTICE 'Repointed job % at property %', job_row.id, new_property_id;
END $$;
