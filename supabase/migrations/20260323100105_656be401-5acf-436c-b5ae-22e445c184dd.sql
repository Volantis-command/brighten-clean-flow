
-- Allow anonymous users to read client_properties by onboard_token
CREATE POLICY "Anon can select client_properties"
ON public.client_properties FOR SELECT
TO anon
USING (true);

-- Allow anonymous users to update onboard_used flag
CREATE POLICY "Anon can update client_properties"
ON public.client_properties FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anonymous users to read properties for onboarding
CREATE POLICY "Anon can view properties for onboarding"
ON public.properties FOR SELECT
TO anon
USING (true);

-- Allow anon to update properties during onboarding
CREATE POLICY "Anon can update properties for onboarding"
ON public.properties FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow anon to insert clean_requests from onboarding
CREATE POLICY "Anon can insert clean_requests"
ON public.clean_requests FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to insert notifications from onboarding
CREATE POLICY "Anon can insert notifications"
ON public.notifications FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to read user_roles for admin lookup
CREATE POLICY "Anon can read user_roles"
ON public.user_roles FOR SELECT
TO anon
USING (true);

-- Allow anon to read profiles for name lookup
CREATE POLICY "Anon can read profiles"
ON public.profiles FOR SELECT
TO anon
USING (true);
