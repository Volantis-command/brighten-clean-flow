-- Add missing columns to properties referenced by PropertyProfileForm
-- (Lovable-generated form fields that never had matching schema).
--
-- Each ADD COLUMN IF NOT EXISTS is idempotent and additive — safe to run
-- repeatedly, safe to run on a DB that already has the columns.
--
-- Context: 2026-04-22. Brendan was filling out a property profile form in
-- Andrew's client portal and hit "Could not find the 'amenities_restock'
-- column of 'properties' in the schema cache". Audit of the form found 9
-- additional columns referenced by the save payload that don't exist on
-- properties. This migration adds them all so the Save Profile button
-- works for every field the form captures.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS amenities_restock boolean,
  ADD COLUMN IF NOT EXISTS linen_provided boolean,
  ADD COLUMN IF NOT EXISTS linen_sets integer,
  ADD COLUMN IF NOT EXISTS guest_wifi text,
  ADD COLUMN IF NOT EXISTS is_occupied boolean,
  ADD COLUMN IF NOT EXISTS occupant_count integer,
  ADD COLUMN IF NOT EXISTS locked_price_inc_gst numeric,
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS client_email text;
