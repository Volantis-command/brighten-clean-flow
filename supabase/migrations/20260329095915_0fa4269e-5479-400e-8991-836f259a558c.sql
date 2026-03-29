-- Drop and recreate FKs with ON DELETE CASCADE for all tables referencing properties.id

ALTER TABLE public.clean_requests DROP CONSTRAINT clean_requests_property_id_fkey;
ALTER TABLE public.clean_requests ADD CONSTRAINT clean_requests_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.client_messages DROP CONSTRAINT client_messages_property_id_fkey;
ALTER TABLE public.client_messages ADD CONSTRAINT client_messages_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.job_feedback DROP CONSTRAINT job_feedback_property_id_fkey;
ALTER TABLE public.job_feedback ADD CONSTRAINT job_feedback_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.job_forms DROP CONSTRAINT job_forms_property_id_fkey;
ALTER TABLE public.job_forms ADD CONSTRAINT job_forms_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.job_series DROP CONSTRAINT job_series_property_id_fkey;
ALTER TABLE public.job_series ADD CONSTRAINT job_series_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.photos DROP CONSTRAINT photos_property_id_fkey;
ALTER TABLE public.photos ADD CONSTRAINT photos_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.property_issues DROP CONSTRAINT property_issues_property_id_fkey;
ALTER TABLE public.property_issues ADD CONSTRAINT property_issues_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.qc_audits DROP CONSTRAINT qc_audits_property_id_fkey;
ALTER TABLE public.qc_audits ADD CONSTRAINT qc_audits_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.quotes DROP CONSTRAINT quotes_property_id_fkey;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;