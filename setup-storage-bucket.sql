-- ============================================
-- Supabase Storage Bucket Setup for Videos
-- ============================================
-- 
-- IMPORTANT: You must create the bucket in the Supabase Dashboard first!
-- 
-- Steps:
-- 1. Go to Storage in your Supabase dashboard
-- 2. Click "Create a new bucket"
-- 3. Name: "videos"
-- 4. Check "Public bucket" (enable public access)
-- 5. Click "Create bucket"
-- 
-- Then run this script to set up the policies.
-- ============================================

-- Enable RLS on storage.objects (should already be enabled, but just in case)
-- Note: This is handled automatically by Supabase, but included for reference

-- Policy 1: Allow public reads (anyone can view videos)
CREATE POLICY IF NOT EXISTS "Allow public reads on videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'videos');

-- Policy 2: Allow public uploads (anyone can upload videos)
-- Note: Since this app uses link-based auth (not Supabase Auth),
-- we need public uploads. For production, consider adding validation.
CREATE POLICY IF NOT EXISTS "Allow public uploads to videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'videos');

-- Policy 3: Allow public deletes (anyone can delete videos)
-- Note: This allows deletion. For production, you may want to restrict this
-- or add additional checks (e.g., only allow deletion by the uploader).
CREATE POLICY IF NOT EXISTS "Allow public deletes from videos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'videos');

-- Policy 4: Allow public updates (for updating metadata if needed)
CREATE POLICY IF NOT EXISTS "Allow public updates to videos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'videos')
WITH CHECK (bucket_id = 'videos');

-- ============================================
-- Verification Queries
-- ============================================
-- Run these to verify the setup:

-- Check if bucket exists (run in SQL Editor):
-- SELECT * FROM storage.buckets WHERE name = 'videos';

-- Check policies (run in SQL Editor):
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%videos%';

-- ============================================
-- Alternative: More Secure Policies (Optional)
-- ============================================
-- If you want to add file size limits or other restrictions,
-- you can modify the policies. For example, to limit file size:

-- DROP POLICY IF EXISTS "Allow public uploads to videos" ON storage.objects;
-- 
-- CREATE POLICY "Allow public uploads to videos (with size limit)"
-- ON storage.objects
-- FOR INSERT
-- WITH CHECK (
--   bucket_id = 'videos' 
--   AND (storage.foldername(name))[1] IS NOT NULL  -- Ensure proper folder structure
--   -- Add size check if needed (requires custom function)
-- );

