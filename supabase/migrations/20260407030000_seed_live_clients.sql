-- Seed live client data: Lynn Robertson and Alexandra
-- Runs as postgres role (bypasses RLS)

-- Lynn Robertson — 6 La Scala Court, Surfers Paradise (4BR/3BA Standard Clean)
INSERT INTO public.properties (
  property_name, address, suburb, state, postcode,
  client_name, bedrooms, bathrooms, property_type, status
)
SELECT
  '6 La Scala Court, Surfers Paradise',
  '6 La Scala Court Surfers Paradise',
  'Surfers Paradise', 'QLD', '4217',
  'Lynn Robertson', 4, 3, 'residential', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.properties
  WHERE client_name = 'Lynn Robertson'
  AND address ILIKE '%La Scala%'
);

-- Ensure Lynn exists as a profile (client role)
INSERT INTO public.profiles (id, full_name, phone, email, role)
SELECT
  gen_random_uuid(),
  'Lynn Robertson',
  '0499777597',
  'lynndebrobertson@icloud.com',
  'client'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE phone = '0499777597'
);

-- ═══════ Property profile columns ═══════
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bed_config JSONB DEFAULT '[]';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS garage_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS parking_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS room_notes JSONB DEFAULT '{}';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS locked_price_inc_gst NUMERIC(10,2);
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,1);
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS linen_provided BOOLEAN DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS linen_sets INTEGER DEFAULT 0;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS amenities_restock BOOLEAN DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS amenities_list TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS sofa_beds INTEGER DEFAULT 0;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS guest_access_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS guest_wifi TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS occupant_count INTEGER DEFAULT 0;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS client_email TEXT;

-- Alexandra Cornish — 286 The Esplanade Miami (1BR/1BA Airbnb)
INSERT INTO public.properties (
  property_name, address, suburb, state, postcode,
  client_name, client_phone, client_email,
  bedrooms, bathrooms, property_type, status
)
SELECT
  '286 The Esplanade, Miami',
  '286 The Esplanade Miami',
  'Miami', 'QLD', '4220',
  'Alexandra Cornish', '0423890994', 'alexandracornish@yahoo.com.au',
  1, 1, 'airbnb', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.properties
  WHERE client_name = 'Alexandra Cornish'
  AND address ILIKE '%Esplanade%'
);

-- Ensure Alexandra exists as a profile
INSERT INTO public.profiles (id, full_name, phone, email, role)
SELECT
  gen_random_uuid(),
  'Alexandra Cornish',
  '0423890994',
  'alexandracornish@yahoo.com.au',
  'client'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE phone = '0423890994'
);

-- Link Lynn to client_properties
-- FIXED 2026-04-22: removed `property_address` — column doesn't exist on
-- client_properties (pure junction table). Original migration would have
-- failed at apply time. Junction only needs client_id + property_id.
INSERT INTO public.client_properties (client_id, property_id)
SELECT p.id, pr.id
FROM public.profiles p, public.properties pr
WHERE p.phone = '0499777597' AND pr.address ILIKE '%La Scala%'
AND NOT EXISTS (
  SELECT 1 FROM public.client_properties cp
  WHERE cp.client_id = p.id AND cp.property_id = pr.id
);

-- Link Alexandra to client_properties
-- FIXED 2026-04-22: removed `property_address` — column doesn't exist on
-- client_properties (pure junction table). Original migration would have
-- failed at apply time. Junction only needs client_id + property_id.
INSERT INTO public.client_properties (client_id, property_id)
SELECT p.id, pr.id
FROM public.profiles p, public.properties pr
WHERE p.phone = '0423890994' AND pr.address ILIKE '%Esplanade%'
AND NOT EXISTS (
  SELECT 1 FROM public.client_properties cp
  WHERE cp.client_id = p.id AND cp.property_id = pr.id
);
