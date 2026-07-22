-- Add category column to document_shares table
ALTER TABLE public.document_shares 
ADD COLUMN category text NOT NULL DEFAULT 'general';

-- Add check constraint for valid categories
ALTER TABLE public.document_shares 
ADD CONSTRAINT valid_category CHECK (category IN ('general', 'payslip'));

-- Drop existing overly permissive RLS policies
DROP POLICY IF EXISTS "Anyone can view all documents" ON public.document_shares;
DROP POLICY IF EXISTS "Anyone can upload documents" ON public.document_shares;
DROP POLICY IF EXISTS "Anyone can update any document" ON public.document_shares;
DROP POLICY IF EXISTS "Anyone can delete any document" ON public.document_shares;

-- Create secure RLS policies
-- Users can view their own documents or admins can view all
CREATE POLICY "Users can view own documents or admins view all" 
ON public.document_shares 
FOR SELECT 
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'HR')
  )
);

-- Admins/HR can upload documents for any user
CREATE POLICY "Admins can upload documents" 
ON public.document_shares 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'HR')
  )
);

-- Admins/HR can update documents
CREATE POLICY "Admins can update documents" 
ON public.document_shares 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'HR')
  )
);

-- Admins/HR can delete documents
CREATE POLICY "Admins can delete documents" 
ON public.document_shares 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'HR')
  )
);

-- Create storage policies for user-documents bucket (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-documents', 'user-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for secure document access
CREATE POLICY "Users can view own documents or admins view all" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'user-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1] OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'HR')
    )
  )
);

CREATE POLICY "Admins can upload documents to storage" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'user-documents' AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'HR')
  )
);

CREATE POLICY "Admins can delete documents from storage" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'user-documents' AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'HR')
  )
);