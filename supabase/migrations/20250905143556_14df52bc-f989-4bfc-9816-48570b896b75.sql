-- Create user-documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-documents', 
  'user-documents', 
  false, 
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Create RLS policies for user-documents bucket
-- Admins can upload/manage documents for any user
CREATE POLICY "Admins can upload documents for any user" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'user-documents' 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin', 'HR')
  )
);

CREATE POLICY "Admins can view all user documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'user-documents' 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin', 'HR')
  )
);

CREATE POLICY "Admins can update user documents" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'user-documents' 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin', 'HR')
  )
);

CREATE POLICY "Admins can delete user documents" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'user-documents' 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin', 'HR')
  )
);

-- Users can only view their own documents
CREATE POLICY "Users can view their own documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'user-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create document_shares table for tracking document access
CREATE TABLE public.document_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_path text NOT NULL,
  user_id uuid NOT NULL,
  shared_by uuid NOT NULL,
  shared_at timestamp with time zone NOT NULL DEFAULT now(),
  document_name text NOT NULL,
  document_type text,
  file_size bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on document_shares
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_shares
CREATE POLICY "Users can view documents shared with them" 
ON public.document_shares 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage document shares" 
ON public.document_shares 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin', 'HR')
  )
);

-- Create function to update document_shares updated_at
CREATE OR REPLACE FUNCTION public.update_document_shares_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for document_shares
CREATE TRIGGER update_document_shares_updated_at
  BEFORE UPDATE ON public.document_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.update_document_shares_updated_at();