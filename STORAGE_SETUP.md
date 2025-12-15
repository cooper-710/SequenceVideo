# Supabase Storage Setup Guide

This guide will help you set up the Supabase Storage bucket for video uploads.

## Quick Setup Steps

### Step 1: Create the Storage Bucket (via Dashboard)

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"Create a new bucket"** button
4. Fill in the form:
   - **Name**: `videos` (must be exactly this name)
   - **Public bucket**: ✅ **Check this box** (enable public access)
   - **File size limit**: (optional) Set a limit like `100 MB` or `500 MB`
   - **Allowed MIME types**: (optional) Leave empty or add: `video/mp4,video/webm,video/quicktime`
5. Click **"Create bucket"**

### Step 2: Set Up Storage Policies (via SQL Editor)

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Open the file `setup-storage-bucket.sql` from this project
4. Copy and paste the entire contents into the SQL Editor
5. Click **"Run"** (or press Cmd/Ctrl + Enter)
6. You should see success messages for each policy creation

### Step 3: Verify the Setup

Run these queries in the SQL Editor to verify:

```sql
-- Check if bucket exists
SELECT * FROM storage.buckets WHERE name = 'videos';

-- Check policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND policyname LIKE '%videos%';
```

You should see:
- 1 bucket named `videos`
- 4 policies for the `videos` bucket

## Testing the Setup

1. Try uploading a video in your app
2. Check the browser console for any errors
3. Go to **Storage** → **videos** bucket in Supabase dashboard
4. You should see uploaded video files

## Troubleshooting

### "Bucket not found" error
- Make sure you created the bucket with the exact name `videos`
- Check that the bucket exists: `SELECT * FROM storage.buckets WHERE name = 'videos';`

### "Permission denied" error
- Make sure you ran the SQL script to create the policies
- Check that the bucket is set to **Public**
- Verify policies exist: Run the verification query above

### Videos not accessible
- Check that the bucket is **Public**
- Verify the policies allow SELECT operations
- Check browser console for CORS errors (shouldn't happen with public buckets)

### Upload fails silently
- Check browser console for errors
- Verify INSERT policy exists
- Check file size limits in bucket settings
- Make sure the bucket name is exactly `videos` (case-sensitive)

## Security Considerations

⚠️ **Current Setup**: The bucket is public, meaning:
- Anyone with the URL can view videos
- Anyone can upload videos
- Anyone can delete videos

For production, consider:
1. **Adding file size limits** in bucket settings
2. **Adding MIME type restrictions** in bucket settings
3. **Implementing server-side validation** via Supabase Edge Functions
4. **Using signed URLs** for temporary access
5. **Adding rate limiting** to prevent abuse
6. **Implementing user-based access control** if you migrate to Supabase Auth

## File Structure

Videos will be stored with filenames like:
```
video_1234567890_abc123.mp4
video_1234567891_def456.webm
```

The format is: `video_{timestamp}_{random}.{extension}`

## Cleanup

To remove the storage setup:

```sql
-- Remove policies
DROP POLICY IF EXISTS "Allow public reads on videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from videos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to videos" ON storage.objects;

-- Then delete the bucket via Dashboard:
-- Storage → videos bucket → Settings → Delete bucket
```

