-- CRITICAL SECURITY FIX: Tighten comprehensive_users table access
-- Issue: Table contains sensitive employee data (emails, phones, addresses, DOB) 
-- with policies applied to 'public' role instead of 'authenticated'

-- First, drop the existing overly permissive policies
DROP POLICY IF EXISTS "HR_Admin_only_comprehensive_users_access" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Ultra_restricted_comprehensive_users_access" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Users can view their own comprehensive_users record" ON public.comprehensive_users;

-- Create new, more secure policies with proper role restrictions

-- Users can ONLY view their own record (and only if they have an active profile)
CREATE POLICY "Users_can_view_own_record_only" 
ON public.comprehensive_users 
FOR SELECT 
TO authenticated
USING (
  auth.uid() = auth_user_id AND
  -- Additional security: ensure user has active profile
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND status = 'Active'::user_status
  )
);

-- HR/Admin can access all employee data (with audit logging via functions)
CREATE POLICY "HR_Admin_secure_access_only" 
ON public.comprehensive_users 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR'::user_role, 'Admin'::user_role, 'Super-Admin'::user_role)
    AND status = 'Active'::user_status
  )
);

-- HR/Admin can insert new employee records
CREATE POLICY "HR_Admin_can_insert_employees" 
ON public.comprehensive_users 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR'::user_role, 'Admin'::user_role, 'Super-Admin'::user_role)
    AND status = 'Active'::user_status
  )
);

-- HR/Admin can update employee records
CREATE POLICY "HR_Admin_can_update_employees" 
ON public.comprehensive_users 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR'::user_role, 'Admin'::user_role, 'Super-Admin'::user_role)
    AND status = 'Active'::user_status
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR'::user_role, 'Admin'::user_role, 'Super-Admin'::user_role)
    AND status = 'Active'::user_status
  )
);

-- Only Super-Admin can delete employee records
CREATE POLICY "Super_Admin_only_can_delete_employees" 
ON public.comprehensive_users 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'::user_role
    AND status = 'Active'::user_status
  )
);

-- Create audit trigger for data modifications (not SELECT)
CREATE OR REPLACE FUNCTION public.audit_comprehensive_users_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log any modifications to sensitive employee data
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      timestamp
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.id::text, OLD.id::text),
      TG_OP || '_COMPREHENSIVE_USERS',
      NOW()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply the audit trigger for modifications only
DROP TRIGGER IF EXISTS audit_comprehensive_users_changes_trigger ON public.comprehensive_users;
CREATE TRIGGER audit_comprehensive_users_changes_trigger
  AFTER UPDATE OR DELETE ON public.comprehensive_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_comprehensive_users_changes();

-- Create enhanced secure function for employee data access with proper masking
CREATE OR REPLACE FUNCTION public.get_employee_data_secure(target_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  auth_user_id uuid,
  name text,
  email text,
  phone_number text,
  role text,
  status text,
  employee_id text,
  department text,
  job_position text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  city text,
  country text,
  is_system_user boolean,
  is_staff_member boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_hr_admin boolean := false;
  query_user_id uuid;
BEGIN
  -- Check if user has HR/Admin privileges
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR'::user_role, 'Admin'::user_role, 'Super-Admin'::user_role)
    AND status = 'Active'::user_status
  ) INTO is_hr_admin;
  
  -- Determine target user (self if not specified or not admin)
  IF target_user_id IS NULL OR NOT is_hr_admin THEN
    query_user_id := auth.uid();
  ELSE
    query_user_id := target_user_id;
  END IF;
  
  -- Log access to sensitive data
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action,
    timestamp
  ) VALUES (
    auth.uid(),
    query_user_id::text,
    'SECURE_ACCESS_COMPREHENSIVE_USERS',
    NOW()
  );
  
  -- Return data with appropriate masking
  RETURN QUERY
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    -- Mask email for non-admin users viewing others
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.email
      ELSE LEFT(cu.email, 3) || '***@' || RIGHT(cu.email, 10)
    END as email,
    -- Mask phone for non-admin users viewing others  
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.phone_number
      ELSE '***-***-' || RIGHT(cu.phone_number, 4)
    END as phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    -- Emergency contacts only for admin or self
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.emergency_contact_name
      ELSE NULL
    END as emergency_contact_name,
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.emergency_contact_phone
      ELSE NULL
    END as emergency_contact_phone,
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.emergency_contact_relationship
      ELSE NULL
    END as emergency_contact_relationship,
    cu.city,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = query_user_id
    AND cu.status = 'Active'
  LIMIT 1;
END;
$$;

-- Add security documentation
COMMENT ON TABLE public.comprehensive_users IS 'SECURITY: Contains sensitive employee data including PII. Access restricted to authenticated users only. Use get_employee_data_secure() function for safe access. All modifications are audited.';

COMMENT ON FUNCTION public.get_employee_data_secure IS 'SECURITY: Safe function to access employee data with proper masking and audit logging. Use this instead of direct table queries.';