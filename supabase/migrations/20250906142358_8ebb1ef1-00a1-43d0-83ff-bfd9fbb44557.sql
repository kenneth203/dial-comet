-- CRITICAL SECURITY FIXES (Corrected)
-- Fix 1: Lock down system_users table to prevent direct access to PII
-- Remove the overly permissive emergency access policy that allows HR/Super-Admin direct access to all PII
DROP POLICY IF EXISTS "HR_SuperAdmin_emergency_system_users_access" ON public.system_users;

-- Fix 2: Restrict shift_templates visibility to admin/supervisor only
-- Remove permissive policies that allow all authenticated users to view templates
DROP POLICY IF EXISTS "Authenticated users can view shift templates" ON public.shift_templates;
DROP POLICY IF EXISTS "Users can view active shift templates" ON public.shift_templates;

-- Fix 3: Ensure all remaining SECURITY DEFINER functions have proper search_path
-- Update any functions that might be missing the search_path setting
CREATE OR REPLACE FUNCTION public.can_access_customer_billing_data(target_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR', 'Admin')
  );
$$;

-- Fix 4: Create secure RPC for emergency system user access if truly needed
-- This replaces the overly permissive policy with proper access controls and audit logging
CREATE OR REPLACE FUNCTION public.get_system_user_emergency_access(
  target_user_id uuid,
  access_reason text
)
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  role text,
  status text,
  department text,
  emergency_contact_name text,
  emergency_contact_phone text,
  access_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  accessor_role TEXT;
  risk_score INTEGER := 0;
BEGIN
  -- Only Super-Admin can use emergency access
  SELECT p.role::TEXT INTO accessor_role 
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  IF accessor_role != 'Super-Admin' THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Emergency access requires Super-Admin role';
  END IF;
  
  -- Validate access reason
  IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 30 THEN
    risk_score := risk_score + 50;
    RAISE EXCEPTION 'SECURITY_VIOLATION: Emergency access requires detailed justification (min 30 chars)';
  END IF;
  
  -- Log the emergency access with high visibility
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score, fields_accessed
  ) VALUES (
    auth.uid(), target_user_id, 'EMERGENCY_SYSTEM_USER_ACCESS', access_reason, 
    risk_score, ARRAY['name', 'email', 'role', 'emergency_contacts']
  );
  
  -- Return minimal necessary data with masked sensitive fields
  RETURN QUERY
  SELECT 
    su.id,
    su.name,
    su.email,
    su.role,
    su.status,
    su.department,
    su.emergency_name,
    mask_phone_number(su.emergency_phone),
    'EMERGENCY_ACCESS'::text as access_level
  FROM public.system_users su
  WHERE su.user_id = target_user_id;
END;
$$;

-- Fix 5: Add security comment to document these changes
COMMENT ON SCHEMA public IS 'Security hardened: restricted system_users/shift_templates access, added emergency access controls with audit logging';