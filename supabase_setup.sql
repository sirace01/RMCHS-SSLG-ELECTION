-- Copy and paste this into the Supabase SQL Editor to fix the image upload issue.

-- 1. Create the Storage Bucket for Candidate Photos
-- This creates a public bucket named 'candidate-photos'
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Remove existing policies to prevent conflicts if re-running
DROP POLICY IF EXISTS "Public View Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete Access" ON storage.objects;

-- 3. Create Policy: Allow Public Read Access
-- This ensures the Ballot and Admin Dashboard can display the images.
CREATE POLICY "Public View Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'candidate-photos' );

-- 4. Create Policy: Allow Public Uploads
-- CRITICAL: Since the app uses client-side admin validation without Supabase Auth,
-- we must allow the 'anon' key to upload files to this specific bucket.
CREATE POLICY "Public Upload Access"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'candidate-photos' );

-- 5. Create Policy: Allow Public Deletion
-- Required for the "Delete Candidate" function to work properly.
CREATE POLICY "Public Delete Access"
ON storage.objects FOR DELETE
USING ( bucket_id = 'candidate-photos' );
