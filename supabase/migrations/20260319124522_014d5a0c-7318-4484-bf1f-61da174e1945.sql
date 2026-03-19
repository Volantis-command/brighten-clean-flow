ALTER TABLE public.qc_audits ADD COLUMN IF NOT EXISTS re_clean_date date DEFAULT NULL;
ALTER TABLE public.qc_audits ADD COLUMN IF NOT EXISTS cleaner_id uuid DEFAULT NULL;