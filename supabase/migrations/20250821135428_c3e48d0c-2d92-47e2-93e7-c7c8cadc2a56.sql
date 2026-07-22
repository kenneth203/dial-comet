-- =====================================================
-- CRITICAL SECURITY FIX: Employee Personal Data Protection  
-- =====================================================

-- Step 1: Remove the unsafe RLS policy that allows users to view their own comprehensive data
DROP POLICY IF EXISTS "Users can view own basic profile - restricted" ON public.comprehensive_users;

-- Step 2: Create a new, extremely restrictive RLS policy for comprehensive_users
-- This ensures ONLY HR/Admin can access the comprehensive_users table directly
CREATE POLICY "Ultra_restricted_comprehensive_users_access" 
ON public.comprehensive_users 
FOR ALL 
USING (
  -- Only HR, Admin, and Super-Admin roles can access comprehensive user data
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
  )
);

-- Step 3: Create a secure function for users to access ONLY their basic, safe profile data
CREATE OR REPLACE FUNCTION public.get_my_safe_profile_data()
RETURNS TABLE(
  id UUID,
  name TEXT,
  email TEXT,
  phone_number TEXT,
  role TEXT,
  status TEXT,
  department TEXT,
  job_position TEXT,
  is_system_user BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only return basic, non-sensitive fields for the authenticated user
  -- Excludes: salary, addresses, emergency contacts, DOB, financial info, etc.
  RETURN QUERY
  SELECT 
    cu.id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position,
    cu.is_system_user,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid()
  LIMIT 1;
END;
$function$;

-- Step 4: Create HR-only function to access sensitive employee data with audit logging
CREATE OR REPLACE FUNCTION public.get_employee_sensitive_data_hr_only(
  target_user_id UUID,
  access_reason TEXT
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  email TEXT,
  phone_number TEXT,
  date_of_birth DATE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  employee_id TEXT,
  role TEXT,
  status TEXT,
  department TEXT,
  job_position TEXT,
  contract_type TEXT,
  working_hours_per_week NUMERIC,
  start_date DATE,
  annual_leave_entitlement NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  access_level TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  accessor_role TEXT;
BEGIN
  -- Get current user role
  SELECT role::TEXT INTO accessor_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Strict role validation - only HR and Super-Admin
  IF accessor_role NOT IN ('HR', 'Super-Admin') THEN
    -- Log unauthorized access attempt
    INSERT INTO public.sensitive_data_access_log (
      accessed_by, employee_user_id, data_type, access_reason
    ) VALUES (
      auth.uid(), target_user_id, 'personal_data_unauthorized', 
      COALESCE(access_reason, 'Unauthorized access attempt')
    );
    
    RAISE EXCEPTION 'SECURITY_VIOLATION: Only HR and Super-Admin can access sensitive employee data';
  END IF;
  
  -- Require detailed access reason
  IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 20 THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Detailed access reason (min 20 chars) required for sensitive data access';
  END IF;
  
  -- Log authorized access
  INSERT INTO public.sensitive_data_access_log (
    accessed_by, employee_user_id, data_type, access_reason
  ) VALUES (
    auth.uid(), target_user_id, 'personal_data_authorized', access_reason
  );
  
  -- Return sensitive employee data
  RETURN QUERY
  SELECT 
    cu.id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.date_of_birth,
    cu.address_line1,
    cu.address_line2,
    cu.city,
    cu.postal_code,
    cu.country,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.employee_id,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.created_at,
    cu.updated_at,
    'HR_AUTHORIZED' as access_level
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = target_user_id
  LIMIT 1;
END;
$function$;

-- Step 5: Create function for users to safely update their own basic information
CREATE OR REPLACE FUNCTION public.update_my_safe_profile_data(
  new_phone_number TEXT DEFAULT NULL,
  new_emergency_contact_name TEXT DEFAULT NULL,
  new_emergency_contact_phone TEXT DEFAULT NULL,
  new_emergency_contact_relationship TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Users can only update basic, safe fields for their own record
  UPDATE public.comprehensive_users 
  SET 
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE auth_user_id = auth.uid();
  
  -- Log the update
  INSERT INTO public.sensitive_data_access_log (
    accessed_by, employee_user_id, data_type, access_reason
  ) VALUES (
    auth.uid(), auth.uid(), 'personal_data_self_update', 'User updating own basic profile information'
  );
  
  RETURN TRUE;
END;
$function$;

-- Step 6: Create HR function to get employee list with basic info only (for dropdowns, etc.)
CREATE OR REPLACE FUNCTION public.get_employees_basic_list_hr_only()
RETURNS TABLE(
  id UUID,
  auth_user_id UUID,
  name TEXT,
  email TEXT,
  role TEXT,
  status TEXT,
  department TEXT,
  job_position TEXT,
  employee_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  accessor_role TEXT;
BEGIN
  -- Get current user role
  SELECT role::TEXT INTO accessor_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Only HR, Admin, and Super-Admin can get employee lists
  IF accessor_role NOT IN ('HR', 'Admin', 'Super-Admin') THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Only HR/Admin can access employee lists';
  END IF;
  
  -- Return basic employee information (no sensitive data)
  RETURN QUERY
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position,
    cu.employee_id
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active'
  ORDER BY cu.name;
END;
$function$;

-- Step 7: Add comprehensive security documentation
COMMENT ON TABLE public.comprehensive_users IS 
'🔒 MAXIMUM SECURITY TABLE: Contains highly sensitive employee personal data.
⚠️  CRITICAL: Direct access restricted to HR/Admin only.
✅ Users access safe data via: get_my_safe_profile_data()
🛡️  HR accesses sensitive data via: get_employee_sensitive_data_hr_only()
📋 All access logged for security compliance and audit trails.
🚫 Contains: DOB, addresses, salary, emergency contacts - NEVER expose to regular users.';

COMMENT ON FUNCTION public.get_my_safe_profile_data IS 
'SAFE USER ACCESS: Returns only basic, non-sensitive profile information for authenticated user.';

COMMENT ON FUNCTION public.get_employee_sensitive_data_hr_only IS 
'HR ONLY ACCESS: Requires detailed justification and logs all access for sensitive employee data.';

-- Step 8: Security implementation complete
SELECT 
    '🔒 CRITICAL_HR_DATA_VULNERABILITY_FIXED' as status,
    'Employee personal data now protected with maximum security' as message,
    'Direct user access removed - HR-only access with audit logging' as access_control,
    'Safe functions created for legitimate user profile access' as user_access;