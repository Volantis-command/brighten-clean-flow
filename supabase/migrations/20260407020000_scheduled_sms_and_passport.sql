-- Scheduled SMS table for frontend-triggered SMS automation
CREATE TABLE IF NOT EXISTS scheduled_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('client', 'cleaner')),
  recipient_phone text,
  message text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sms_pending ON scheduled_sms (send_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE scheduled_sms ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write (admin operations)
CREATE POLICY "Authenticated users can manage scheduled_sms" ON scheduled_sms
  FOR ALL USING (auth.role() = 'authenticated');

-- Property Passport fields on client_properties
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'access_method') THEN
    ALTER TABLE client_properties ADD COLUMN access_method text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'access_code') THEN
    ALTER TABLE client_properties ADD COLUMN access_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'alarm_code') THEN
    ALTER TABLE client_properties ADD COLUMN alarm_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'garage_code') THEN
    ALTER TABLE client_properties ADD COLUMN garage_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'parking_notes') THEN
    ALTER TABLE client_properties ADD COLUMN parking_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'pet_notes') THEN
    ALTER TABLE client_properties ADD COLUMN pet_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'product_restrictions') THEN
    ALTER TABLE client_properties ADD COLUMN product_restrictions text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'special_instructions') THEN
    ALTER TABLE client_properties ADD COLUMN special_instructions text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'preferences_notes') THEN
    ALTER TABLE client_properties ADD COLUMN preferences_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_properties' AND column_name = 'room_notes') THEN
    ALTER TABLE client_properties ADD COLUMN room_notes jsonb;
  END IF;
END $$;

-- Paperwork status on profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'paperwork_status') THEN
    ALTER TABLE profiles ADD COLUMN paperwork_status jsonb DEFAULT '{}';
  END IF;
END $$;
