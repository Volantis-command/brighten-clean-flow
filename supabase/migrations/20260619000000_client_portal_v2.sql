-- Client portal v2 additions
-- 1. Logo URL on profiles (for client branding in portal header)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Client change request table (portal "Request a change" flow)
CREATE TABLE IF NOT EXISTS client_change_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  client_id UUID,
  portal_token TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE client_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal insert change requests"
  ON client_change_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin manage change requests"
  ON client_change_requests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
