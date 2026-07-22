
-- Create storage bucket for form builder images
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-images', 'form-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload form images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'form-images');

-- Allow public read access
CREATE POLICY "Public can view form images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'form-images');

-- Allow uploaders to delete their own images
CREATE POLICY "Users can delete own form images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'form-images');
