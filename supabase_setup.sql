-- Run this in Supabase SQL Editor to fix the error

-- 1. Create Storage Bucket for photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies
DROP POLICY IF EXISTS "Public View Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;

CREATE POLICY "Public View Access" ON storage.objects FOR SELECT USING ( bucket_id = 'candidate-photos' );
CREATE POLICY "Allow public uploads" ON storage.objects FOR INSERT TO public WITH CHECK ( bucket_id = 'candidate-photos' );
CREATE POLICY "Public Delete Access" ON storage.objects FOR DELETE TO public USING ( bucket_id = 'candidate-photos' );

-- 3. Create Config Table for Election Status
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 4. Seed Default Values
INSERT INTO config (key, value) VALUES ('election_status', 'OPEN') ON CONFLICT DO NOTHING;
INSERT INTO config (key, value) VALUES ('school_year', '2024-2025') ON CONFLICT DO NOTHING;

-- 5. Enable RLS and Grant Permissions
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Grant access to anon (public) and authenticated users
GRANT ALL ON TABLE config TO anon, authenticated, service_role;

-- 6. Config Policies
DROP POLICY IF EXISTS "Public read config" ON config;
DROP POLICY IF EXISTS "Public update config" ON config;
DROP POLICY IF EXISTS "Public insert config" ON config;

CREATE POLICY "Public read config" ON config FOR SELECT USING (true);
CREATE POLICY "Public update config" ON config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public insert config" ON config FOR INSERT WITH CHECK (true);