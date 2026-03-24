
CREATE TABLE public.staff_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  onboarding_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  
  -- Personal details
  full_name text,
  preferred_name text,
  phone text,
  email text,
  address text,
  date_of_birth date,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  
  -- Tax & super
  tfn text,
  super_fund_name text,
  super_member_number text,
  abn text,
  is_contractor boolean DEFAULT false,
  
  -- Bank details
  bank_bsb text,
  bank_account_number text,
  bank_account_name text,
  
  submitted_at timestamptz,
  admin_reviewed_at timestamptz,
  admin_reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_onboarding ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage staff_onboarding"
ON public.staff_onboarding
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Staff can view/update their own onboarding record
CREATE POLICY "Staff can view own onboarding"
ON public.staff_onboarding
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff can update own onboarding"
ON public.staff_onboarding
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Anon can select and update by token (for public onboarding form)
CREATE POLICY "Anon can select onboarding by token"
ON public.staff_onboarding
FOR SELECT TO anon
USING (true);

CREATE POLICY "Anon can update onboarding by token"
ON public.staff_onboarding
FOR UPDATE TO anon
USING (true)
WITH CHECK (true);
