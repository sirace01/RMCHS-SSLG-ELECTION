-- Copy and paste this into the Supabase SQL Editor.

-- 1. Create Storage Bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop policies to avoid conflicts
DROP POLICY IF EXISTS "Public View Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;

-- 3. Storage Policies
CREATE POLICY "Public View Access" ON storage.objects FOR SELECT USING ( bucket_id = 'candidate-photos' );
CREATE POLICY "Allow public uploads" ON storage.objects FOR INSERT TO public WITH CHECK ( bucket_id = 'candidate-photos' );
CREATE POLICY "Public Delete Access" ON storage.objects FOR DELETE TO public USING ( bucket_id = 'candidate-photos' );

-- 4. Create Config Table for Election Status
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 5. Seed Default Value
INSERT INTO config (key, value) VALUES ('election_status', 'OPEN') ON CONFLICT DO NOTHING;

-- 6. Enable RLS
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- 7. Config Table Policies (CRITICAL for Admin Dashboard)
DROP POLICY IF EXISTS "Public read config" ON config;
DROP POLICY IF EXISTS "Public update config" ON config;
DROP POLICY IF EXISTS "Public insert config" ON config;

-- Allow everyone to read the status
CREATE POLICY "Public read config" ON config FOR SELECT USING (true);

-- Allow everyone (admin) to update the status
-- 'WITH CHECK (true)' is redundant for standard UPDATEs but good for specific Supabase setups
CREATE POLICY "Public update config" ON config FOR UPDATE USING (true) WITH CHECK (true);

-- Allow insert (required for upsert if row somehow missing)
CREATE POLICY "Public insert config" ON config FOR INSERT WITH CHECK (true);