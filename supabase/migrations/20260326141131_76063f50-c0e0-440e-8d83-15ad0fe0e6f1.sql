UPDATE storage.buckets
SET public = false
WHERE id IN ('documents', 'shared-files');