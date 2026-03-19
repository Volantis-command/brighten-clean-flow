-- Add lat/lng to properties for geo-fencing
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS lat numeric DEFAULT NULL;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS lng numeric DEFAULT NULL;

-- Add geo_override flag to time_entries
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS geo_override boolean DEFAULT false;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS geo_distance_meters numeric DEFAULT NULL;