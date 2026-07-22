-- Create storage bucket for noticeboard images
INSERT INTO storage.buckets (id, name, public)
VALUES ('noticeboard-images', 'noticeboard-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload noticeboard images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'noticeboard-images');

-- Allow public read access
CREATE POLICY "Public can view noticeboard images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'noticeboard-images');

-- Allow admins to delete noticeboard images
CREATE POLICY "Admins can delete noticeboard images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'noticeboard-images' AND EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid()
  AND profiles.role IN ('Super-Admin', 'Admin', 'Supervisor')
));