
-- Add pay fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'employee',
ADD COLUMN IF NOT EXISTS super_rate numeric DEFAULT 11.5,
ADD COLUMN IF NOT EXISTS pay_cycle text DEFAULT 'fortnightly';

-- Add timesheet approval fields to time_entries
ALTER TABLE public.time_entries
ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS approved_by uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS manual_hours numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS edit_reason text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS flagged boolean DEFAULT false;
