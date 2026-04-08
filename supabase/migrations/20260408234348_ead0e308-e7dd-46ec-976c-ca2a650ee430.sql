
ALTER TABLE public.cleaner_onboarding
  ADD COLUMN IF NOT EXISTS public_liability_url text,
  ADD COLUMN IF NOT EXISTS public_liability_expiry date,
  ADD COLUMN IF NOT EXISTS vevo_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vevo_check_url text,
  ADD COLUMN IF NOT EXISTS vevo_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS drivers_licence_url text,
  ADD COLUMN IF NOT EXISTS drivers_licence_expiry date,
  ADD COLUMN IF NOT EXISTS vehicle_rego text,
  ADD COLUMN IF NOT EXISTS gst_registered boolean,
  ADD COLUMN IF NOT EXISTS uniform_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sops_resign_due date;
