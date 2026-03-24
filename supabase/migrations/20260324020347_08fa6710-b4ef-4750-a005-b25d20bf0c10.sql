-- Add quote_token to quotes for public quote viewing
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_token uuid DEFAULT gen_random_uuid();
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_accepted_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_declined_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tcs_accepted boolean DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tcs_accepted_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tcs_version text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS acceptance_method text;

-- Create unique index on quote_token
CREATE UNIQUE INDEX IF NOT EXISTS quotes_quote_token_idx ON quotes (quote_token);

-- Allow anon to view quotes by token (for public quote page)
CREATE POLICY "Anon can view quotes by token" ON quotes FOR SELECT TO anon USING (true);
-- Allow anon to update quotes (for accept/decline)
CREATE POLICY "Anon can update quotes by token" ON quotes FOR UPDATE TO anon USING (true) WITH CHECK (true);
