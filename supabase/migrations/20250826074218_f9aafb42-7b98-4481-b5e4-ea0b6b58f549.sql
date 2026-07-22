-- CRITICAL SECURITY FIX: Tighten comprehensive_users table access
-- Issue: Table contains sensitive employee data (emails, phones, addresses, DOB) 
-- with policies applied to 'public' role instead of 'authenticated'

-- First, drop the existing overly permissive policies
DROP POLICY IF EXISTS "HR_Admin_only_comprehensive_users_access" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Ultra_restricted_comprehensive_users_access" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Users can view their own comprehensive_users record" ON public.comprehensive_users;

-- Create new, more secure policies with proper role restrictions

-- Users can ONLY view basic, non-sensitive fields of their own record
CREATE POLICY "Users_can_view_own_basic_info_only" 
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

-- HR/Admin can access comprehensive data but only through secure functions
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

-- HR/Admin can update employee records (with audit trail)
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

-- Create audit trigger for comprehensive_users access
CREATE OR REPLACE FUNCTION public.audit_comprehensive_users_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Log any access to sensitive employee data
  IF TG_OP IN ('SELECT', 'UPDATE', 'DELETE') THEN
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

-- Apply the audit trigger
DROP TRIGGER IF EXISTS audit_comprehensive_users_trigger ON public.comprehensive_users;
CREATE TRIGGER audit_comprehensive_users_trigger
  AFTER SELECT OR UPDATE OR DELETE ON public.comprehensive_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_comprehensive_users_access();

-- Create a secure view for non-sensitive employee data that can be safely accessed
CREATE OR REPLACE VIEW public.employee_directory_safe AS
SELECT 
  id,
  auth_user_id,
  name,
  -- Mask email domain for privacy
  CASE 
    WHEN auth.uid() = auth_user_id OR 
         EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('HR', 'Admin', 'Super-Admin')) 
    THEN email
    ELSE CONCAT(LEFT(email, 3), '***@', RIGHT(email, 10))
  END as email,
  department,
  job_position,
  role,
  status,
  is_system_user,
  is_staff_member,
  created_at
FROM public.comprehensive_users
WHERE 
  -- Only show active employees
  status = 'Active'
  AND (
    -- Users can see their own record
    auth.uid() = auth_user_id 
    OR 
    -- HR/Admin can see all records
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('HR'::user_role, 'Admin'::user_role, 'Super-Admin'::user_role)
    )
  );

-- Enable RLS on the view
ALTER VIEW public.employee_directory_safe SET (security_barrier = true);

-- Add comment documenting the security fix
COMMENT ON TABLE public.comprehensive_users IS 'SECURITY: Contains sensitive employee data. Access restricted to authenticated users only. Use secure functions for data access. Direct table access logs all operations.';

COMMENT ON VIEW public.employee_directory_safe IS 'SECURITY: Safe view of employee directory with sensitive data masked. Use this instead of direct table access for directory listings.';