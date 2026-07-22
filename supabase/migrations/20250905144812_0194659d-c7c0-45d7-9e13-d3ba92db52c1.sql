-- Update document_shares foreign key to work with system_users
-- First drop the existing foreign key constraints
ALTER TABLE public.document_shares 
DROP CONSTRAINT IF EXISTS document_shares_user_id_fkey;

ALTER TABLE public.document_shares 
DROP CONSTRAINT IF EXISTS document_shares_shared_by_fkey;

-- Add new foreign key constraints that can reference either profiles or system_users
-- We'll keep it flexible by not enforcing foreign keys and handle validation in application

-- Update the RLS policies to ensure proper security
-- Users can only see documents shared with them AND only if they are logged in
DROP POLICY IF EXISTS "Users can view documents shared with them" ON public.document_shares;

CREATE POLICY "Authenticated users can view their own documents" 
ON public.document_shares 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    auth.uid() = user_id::uuid 
    OR EXISTS (
      SELECT 1 FROM public.system_users 
      WHERE system_users.user_id = auth.uid() 
      AND system_users.id = document_shares.user_id::uuid
    )
  )
);

-- Ensure storage policies are also secure - only authenticated users can access their files
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;

CREATE POLICY "Authenticated users can view their own documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'user-documents' 
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = (storage.foldername(name))[1]
);