-- Copy and paste this into the Supabase SQL Editor to fix the image upload issue.

-- 1. Create the Storage Bucket for Candidate Photos (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Remove existing policies to prevent conflicts if re-running
DROP POLICY IF EXISTS "Public View Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;

-- 3. Create Policy: Allow Public Read Access
-- This ensures the Ballot and Admin Dashboard can display the images.
CREATE POLICY "Public View Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'candidate-photos' );

-- 4. Create Policy: Allow Public Uploads
-- We explicitly grant this TO public so 'anon' users (the frontend admin) can upload.
CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'candidate-photos' );

-- 5. Create Policy: Allow Public Deletion
CREATE POLICY "Public Delete Access"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'candidate-photos' );

-- 6. Create Config Table for Election Status
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Default to OPEN
INSERT INTO config (key, value) VALUES ('election_status', 'OPEN') ON CONFLICT DO NOTHING;

-- Enable RLS for config
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Allow public access to config (so voters can check status and admin can update)
-- In a production app, update would be restricted to authenticated admins
DROP POLICY IF EXISTS "Public read config" ON config;
DROP POLICY IF EXISTS "Public update config" ON config;
DROP POLICY IF EXISTS "Public insert config" ON config;

CREATE POLICY "Public read config" ON config FOR SELECT USING (true);
CREATE POLICY "Public update config" ON config FOR UPDATE USING (true);
CREATE POLICY "Public insert config" ON config FOR INSERT WITH CHECK (true);