-- Security Fixes Migration (Corrected)
-- Fix 1: Create secure function for holiday_data_anomalies access (it's a view, not a table)
CREATE OR REPLACE FUNCTION public.get_holiday_data_anomalies_secure()
RETURNS TABLE(
  request_id uuid,
  request_user_id uuid, 
  system_user_id uuid,
  system_user_auth_id uuid,
  system_user_name text,
  start_date date,
  end_date date,
  status request_status,
  anomaly_type text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    hda.request_id,
    hda.request_user_id,
    hda.system_user_id,
    hda.system_user_auth_id,
    hda.system_user_name,
    hda.start_date,
    hda.end_date,
    hda.status,
    hda.anomaly_type
  FROM public.holiday_data_anomalies hda
  WHERE is_admin_or_higher();
$$;

-- Fix 2: Restrict v_permissions_matrix access via secure function
CREATE OR REPLACE FUNCTION public.get_permissions_matrix_secure()
RETURNS TABLE(
  id uuid,
  granted boolean,
  grant_id uuid,
  feature text,
  icon text,
  description text,
  role text,
  section text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    pm.id,
    pm.granted,
    pm.grant_id,
    pm.feature,
    pm.icon,
    pm.description,
    pm.role,
    pm.section
  FROM public.v_permissions_matrix pm
  WHERE is_admin_or_higher();
$$;

-- Fix 3: Ensure storage security for private payslips
-- First, ensure user-documents bucket exists and is private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-documents', 'user-documents', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE SET 
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

-- Enhanced storage RLS policies for secure document access
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all documents" ON storage.objects;

-- Secure document access policies
CREATE POLICY "Secure_user_document_access" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'user-documents' AND (
    -- Users can access their own documents (path starts with their user_id)
    (storage.foldername(name))[1] = auth.uid()::text OR
    -- Admins can access all documents
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'HR')
    )
  )
);

CREATE POLICY "Secure_user_document_upload" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'user-documents' AND (
    -- Users can upload to their own folder
    (storage.foldername(name))[1] = auth.uid()::text OR
    -- Admins can upload to any folder (for payslips)
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'HR')
    )
  )
);

CREATE POLICY "Secure_user_document_update" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'user-documents' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'HR')
    )
  )
);

CREATE POLICY "Secure_user_document_delete" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'user-documents' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'HR')
    )
  )
);

-- Fix 4: Add missing mask_email function
CREATE OR REPLACE FUNCTION public.mask_email(email_address text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN email_address IS NULL OR email_address !~ '^[^@]+@[^@]+\.[^@]+$' THEN email_address
    WHEN LENGTH(SPLIT_PART(email_address, '@', 1)) <= 2 THEN 
      '**@' || SPLIT_PART(email_address, '@', 2)
    ELSE 
      LEFT(SPLIT_PART(email_address, '@', 1), 2) || '***@' || SPLIT_PART(email_address, '@', 2)
  END;
$$;