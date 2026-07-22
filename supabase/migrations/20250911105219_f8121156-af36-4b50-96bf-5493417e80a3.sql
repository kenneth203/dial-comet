-- Security Fixes Migration
-- Fix 1: Protect holiday_data_anomalies table with RLS
ALTER TABLE public.holiday_data_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only_admins_can_access_holiday_anomalies" 
ON public.holiday_data_anomalies 
FOR ALL 
USING (is_admin_or_higher());

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

-- Fix 4: Create secure billing dashboard function with proper search path
CREATE OR REPLACE FUNCTION public.get_billing_dashboard_secure()
RETURNS TABLE(
  total_customers bigint,
  total_invoices bigint,
  total_call_logs bigint,
  monthly_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only HR and Super-Admin can access billing dashboard
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
  ) THEN
    RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can access billing dashboard';
  END IF;

  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.customers)::bigint as total_customers,
    (SELECT COUNT(*) FROM public.billing_invoices)::bigint as total_invoices,
    (SELECT COUNT(*) FROM public.call_logs)::bigint as total_call_logs,
    (SELECT COALESCE(SUM(total_with_vat), 0) FROM public.billing_invoices 
     WHERE EXTRACT(MONTH FROM created_on) = EXTRACT(MONTH FROM CURRENT_DATE)
     AND EXTRACT(YEAR FROM created_on) = EXTRACT(YEAR FROM CURRENT_DATE))::numeric as monthly_revenue;
END;
$$;

-- Fix 5: Update existing functions to have proper search paths
CREATE OR REPLACE FUNCTION public.get_employee_sensitive_data_secure(
  employee_user_id uuid,
  access_reason text,
  business_justification text DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  email text,
  phone_number text,
  full_address text,
  date_of_birth date,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  access_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accessor_role TEXT;
  is_self_access BOOLEAN;
BEGIN
  -- Get current user role
  SELECT role::TEXT INTO accessor_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Check if user is accessing their own data
  is_self_access := (auth.uid() = employee_user_id);
  
  -- Enhanced access control
  IF NOT (
    accessor_role IN ('Super-Admin', 'HR') OR 
    (accessor_role IN ('Admin', 'Supervisor') AND business_justification IS NOT NULL) OR
    is_self_access
  ) THEN
    RAISE EXCEPTION 'Access denied: Insufficient privileges for sensitive data access';
  END IF;
  
  -- Validate access reason for non-self access
  IF NOT is_self_access AND (access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 10) THEN
    RAISE EXCEPTION 'Access denied: Detailed access reason required for accessing other user data';
  END IF;
  
  -- Log the access
  INSERT INTO public.sensitive_data_access_log (
    accessed_by, employee_user_id, data_type, access_reason
  ) VALUES (
    auth.uid(), employee_user_id, 'SENSITIVE_PERSONAL_DATA', access_reason
  );
  
  -- Return appropriate data based on access level
  RETURN QUERY
  SELECT 
    esd.user_id,
    CASE 
      WHEN is_self_access OR accessor_role IN ('Super-Admin', 'HR') THEN 
        COALESCE(sd.email, p.email)
      ELSE mask_email(COALESCE(sd.email, p.email))
    END as email,
    CASE 
      WHEN is_self_access OR accessor_role IN ('Super-Admin', 'HR') THEN 
        sd.phone_number
      ELSE mask_phone_number(sd.phone_number)
    END as phone_number,
    CASE 
      WHEN is_self_access OR accessor_role IN ('Super-Admin', 'HR') THEN 
        esd.full_address
      ELSE mask_address(esd.full_address)
    END as full_address,
    CASE 
      WHEN is_self_access OR accessor_role IN ('Super-Admin', 'HR') THEN 
        esd.date_of_birth
      ELSE NULL
    END as date_of_birth,
    CASE 
      WHEN is_self_access OR accessor_role IN ('Super-Admin', 'HR') THEN 
        esd.emergency_contact_name
      ELSE NULL
    END as emergency_contact_name,
    CASE 
      WHEN is_self_access OR accessor_role IN ('Super-Admin', 'HR') THEN 
        esd.emergency_contact_phone
      ELSE mask_phone_number(esd.emergency_contact_phone)
    END as emergency_contact_phone,
    CASE 
      WHEN is_self_access OR accessor_role IN ('Super-Admin', 'HR') THEN 
        esd.emergency_contact_relationship
      ELSE NULL
    END as emergency_contact_relationship,
    CASE 
      WHEN is_self_access THEN 'SELF_ACCESS'
      WHEN accessor_role = 'Super-Admin' THEN 'FULL_ADMIN'
      WHEN accessor_role = 'HR' THEN 'HR_ACCESS'
      ELSE 'MASKED'
    END as access_level
  FROM public.employee_sensitive_data esd
  LEFT JOIN public.staff_details sd ON sd.user_id = esd.user_id
  LEFT JOIN public.profiles p ON p.user_id = esd.user_id
  WHERE esd.user_id = employee_user_id;
END;
$$;

-- Add missing mask_email function
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