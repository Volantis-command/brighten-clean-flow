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
