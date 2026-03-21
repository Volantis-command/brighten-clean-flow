ALTER TABLE public.jobs
  ADD COLUMN price_ex_gst numeric DEFAULT NULL,
  ADD COLUMN price_inc_gst numeric DEFAULT NULL,
  ADD COLUMN price_notes text,
  ADD COLUMN linked_quote_id uuid REFERENCES public.quotes(id);