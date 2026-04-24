
-- Create pricing_settings table
CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value numeric NOT NULL,
  label text,
  category text,
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pricing_settings" ON public.pricing_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view pricing_settings" ON public.pricing_settings
  FOR SELECT TO authenticated
  USING (true);

-- Seed default rates
INSERT INTO public.pricing_settings (key, value, label, category) VALUES
  ('cleaner_hourly_rate', 45.00, 'Cleaner Hourly Rate', 'labour'),
  ('linen_king_flat_sheet', 3.36, 'King Flat Sheet', 'linen'),
  ('linen_queen_flat_sheet', 3.05, 'Queen/Double Flat Sheet', 'linen'),
  ('linen_king_single_flat_sheet', 2.84, 'King Single Flat Sheet', 'linen'),
  ('linen_pillowcase', 1.52, 'Pillowcase', 'linen'),
  ('linen_bath_towel', 2.00, 'Bath Towel', 'linen'),
  ('linen_bath_mat', 1.58, 'Bath Mat', 'linen'),
  ('linen_hand_towel', 1.31, 'Hand Towel', 'linen'),
  ('linen_face_washer', 1.26, 'Face Washer', 'linen'),
  ('linen_tea_towel', 1.05, 'Tea Towel', 'linen'),
  ('linen_bag', 0.95, 'Linen Bag', 'linen'),
  ('consumables_flat_fee', 15.00, 'Consumables Flat Fee', 'other'),
  ('default_gp_percent', 0.40, 'Default GP %', 'other'),
  ('deep_clean_multiplier', 1.50, 'Deep Clean Multiplier', 'other');

-- Add new columns to quotes table
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS client_phone text,
  ADD COLUMN IF NOT EXISTS property_name text,
  ADD COLUMN IF NOT EXISTS property_address text,
  ADD COLUMN IF NOT EXISTS clean_type text,
  ADD COLUMN IF NOT EXISTS bed_types jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hours numeric,
  ADD COLUMN IF NOT EXISTS deep_clean_multiplier numeric,
  ADD COLUMN IF NOT EXISTS labour_cost numeric,
  ADD COLUMN IF NOT EXISTS linen_cost numeric,
  ADD COLUMN IF NOT EXISTS consumables_cost numeric,
  ADD COLUMN IF NOT EXISTS total_cost numeric,
  ADD COLUMN IF NOT EXISTS gp_percent numeric,
  ADD COLUMN IF NOT EXISTS sell_price_ex_gst numeric,
  ADD COLUMN IF NOT EXISTS gst numeric,
  ADD COLUMN IF NOT EXISTS sell_price_inc_gst numeric,
  ADD COLUMN IF NOT EXISTS actual_gp_dollars numeric,
  ADD COLUMN IF NOT EXISTS actual_gp_percent numeric,
  ADD COLUMN IF NOT EXISTS discount_gp_percent numeric,
  ADD COLUMN IF NOT EXISTS discounted_price numeric,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS living_areas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kitchens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balconies integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sofa_beds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outdoor_areas boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS specialist_chemicals numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bond_certificate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS builder_name text,
  ADD COLUMN IF NOT EXISTS sqm numeric,
  ADD COLUMN IF NOT EXISTS levels integer,
  ADD COLUMN IF NOT EXISTS wet_areas integer,
  ADD COLUMN IF NOT EXISTS property_type_build text,
  ADD COLUMN IF NOT EXISTS special_requirements text;

-- Create sequence for quote references
CREATE SEQUENCE IF NOT EXISTS quote_ref_seq START 1;
