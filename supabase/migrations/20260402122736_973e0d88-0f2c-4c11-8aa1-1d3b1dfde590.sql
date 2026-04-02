
INSERT INTO public.app_settings (key, value) VALUES
  ('xero_auto_invoice', 'true'),
  ('xero_auto_send', 'false'),
  ('xero_invoice_status', 'DRAFT'),
  ('xero_default_payment_terms', '7'),
  ('xero_account_standard', '200'),
  ('xero_account_deep', '201'),
  ('xero_account_airbnb', '202'),
  ('xero_account_commercial', '203'),
  ('xero_invoice_prefix', 'BCL-')
ON CONFLICT (key) DO NOTHING;
