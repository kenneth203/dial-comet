-- Remove all user restrictions from Document Library - make completely open

-- Step 1: Drop existing restrictive RLS policies on document_shares
DROP POLICY IF EXISTS "Admins can manage document shares" ON public.document_shares;
DROP POLICY IF EXISTS "Authenticated users can view their own documents" ON public.document_shares;

-- Step 2: Create completely open RLS policies for document_shares
CREATE POLICY "Anyone can view all documents"
ON public.document_shares
FOR SELECT
USING (true);

CREATE POLICY "Anyone can upload documents"
ON public.document_shares
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update any document"
ON public.document_shares
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Anyone can delete any document"
ON public.document_shares
FOR DELETE
USING (true);

-- Step 3: Create public storage bucket for documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', true, 52428800, ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

-- Step 4: Remove all storage object restrictions - make completely open
DROP POLICY IF EXISTS "Admins can manage documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

-- Step 5: Create completely open storage policies
CREATE POLICY "Anyone can view all documents in storage"
ON storage.objects
FOR SELECT
USING (bucket_id = 'documents');

CREATE POLICY "Anyone can upload documents to storage"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anyone can update any document in storage"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anyone can delete any document from storage"
ON storage.objects
FOR DELETE
USING (bucket_id = 'documents');

-- Step 6: Create additional public bucket for shared files if needed
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('shared-files', 'shared-files', true, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Create open policies for shared-files bucket too
CREATE POLICY "Anyone can access shared files"
ON storage.objects
FOR ALL
USING (bucket_id = 'shared-files')
WITH CHECK (bucket_id = 'shared-files');

-- Notification
SELECT 'DOCUMENT_LIBRARY_OPEN: All restrictions removed - anyone can upload, view, edit, and delete any documents' as status;