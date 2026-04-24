-- Recovery migration for columns lost during the Lovable Cloud →
-- owned Supabase schema push (2026-04-25).
--
-- Some migrations in the Lovable history had duplicate CREATE TABLE
-- statements — the same table created twice with slightly different
-- column lists. When we made all CREATE TABLE idempotent (IF NOT
-- EXISTS) to get the push unstuck, the second CREATE skipped silently,
-- taking its extra columns with it.
--
-- This migration adds those columns back explicitly. Types are derived
-- from `src/integrations/supabase/types.ts` which is the canonical
-- schema reference (generated from the pre-migration Lovable Cloud DB).
--
-- properties: 33 columns
-- jobs:        8 columns

-- properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS abn TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS after_hours_access BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS amenities_kit BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS approx_size TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS balconies INTEGER;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bed_config TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS deep_clean_cupboards BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS deep_clean_fridge BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS deep_clean_oven BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS deep_clean_windows BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS first_clean BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS floor_types TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS focus_areas TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS garage_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS guest_access_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS has_garage BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS has_kitchen_breakroom BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS has_security_alarm BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS kitchens INTEGER;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS last_cleaned_when TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS linen_required BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS living_areas INTEGER;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS pet_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS preferences_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS preferred_days TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS preferred_time TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS property_condition TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS property_photos JSONB;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS room_notes JSONB;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS sofa_beds INTEGER;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS tea_coffee_kit BOOLEAN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS wash_kit BOOLEAN;

-- jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS access_method TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS bed_types JSONB;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS checkin_time TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS checkout_time TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS consumables_selection JSONB;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS linen_required BOOLEAN;
