
DROP POLICY IF EXISTS "Admins can update noticeboard images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete noticeboard images" ON storage.objects;

CREATE POLICY "Admins can update noticeboard images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'noticeboard-images'
  AND public.is_admin_or_higher()
)
WITH CHECK (
  bucket_id = 'noticeboard-images'
  AND public.is_admin_or_higher()
);

CREATE POLICY "Admins can delete noticeboard images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'noticeboard-images'
  AND public.is_admin_or_higher()
);
