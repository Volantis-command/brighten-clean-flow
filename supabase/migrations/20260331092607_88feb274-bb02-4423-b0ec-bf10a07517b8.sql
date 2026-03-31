ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_date date;

DROP POLICY IF EXISTS "Anon can update leads for booking" ON public.leads;