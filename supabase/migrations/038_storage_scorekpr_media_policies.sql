-- Migration 038: Storage RLS policies for scorekpr-media bucket
--
-- Game and player image uploads use Supabase Storage (scorekpr-media).
-- Without INSERT/UPDATE/SELECT policies on storage.objects, uploads fail with
-- "new row violates row-level security policy".
--
-- Ensure the bucket "scorekpr-media" exists in the Dashboard (Storage).
-- This migration only adds RLS policies on storage.objects.

-- Allow authenticated users to upload (INSERT) to scorekpr-media
CREATE POLICY "scorekpr_media_authenticated_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'scorekpr-media');

-- Allow overwriting existing files (upsert) — requires SELECT + UPDATE
CREATE POLICY "scorekpr_media_authenticated_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'scorekpr-media');

CREATE POLICY "scorekpr_media_authenticated_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'scorekpr-media')
WITH CHECK (bucket_id = 'scorekpr-media');

-- Allow deleting objects (e.g. "Remove image")
CREATE POLICY "scorekpr_media_authenticated_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'scorekpr-media');

-- Allow public read so image URLs work for shared leaderboards (anon viewers)
CREATE POLICY "scorekpr_media_anon_select"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'scorekpr-media');
