CREATE POLICY "Public read access for noticeboard images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'noticeboard-images');