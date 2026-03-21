ALTER TABLE public.properties
  ADD COLUMN price_turnover numeric DEFAULT NULL,
  ADD COLUMN price_deep_clean numeric DEFAULT NULL,
  ADD COLUMN price_end_of_lease numeric DEFAULT NULL,
  ADD COLUMN price_post_build numeric DEFAULT NULL,
  ADD COLUMN pricing_notes text;