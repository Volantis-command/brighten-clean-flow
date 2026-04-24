-- Xero tokens table
CREATE TABLE IF NOT EXISTS public.xero_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  tenant_id text,
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.xero_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage xero_tokens" ON public.xero_tokens FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Xero settings table
CREATE TABLE IF NOT EXISTS public.xero_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.xero_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage xero_settings" ON public.xero_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view xero_settings" ON public.xero_settings FOR SELECT TO authenticated USING (true);

-- Add invoice columns to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS xero_invoice_id text,
  ADD COLUMN IF NOT EXISTS xero_invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS invoice_amount numeric,
  ADD COLUMN IF NOT EXISTS invoice_notes text;

-- Add xero_invoice_id to quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS xero_invoice_id text;

-- Seed xero_settings defaults
INSERT INTO public.xero_settings (key, value) VALUES
  ('account_code_turnover', '4000'),
  ('account_code_deep_clean', '4000'),
  ('account_code_end_of_lease', '4000'),
  ('account_code_post_build', '4000'),
  ('account_code_default', '4000'),
  ('sales_tax_type', 'GST on Income'),
  ('invoice_prefix', 'BCL-'),
  ('due_days', '7'),
  ('auto_create_invoice', 'true'),
  ('default_line_description', '[Clean Type] — [Property Address] — [Date]'),
  ('auto_create_contact', 'true'),
  ('contact_name_format', '[Property Name] — [Owner Name]')
ON CONFLICT (key) DO NOTHING;