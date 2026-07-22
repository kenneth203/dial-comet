-- Security hardening: Fix profiles RLS policies to prevent recursion
-- Replace self-referencing policies with security definer function calls

-- Drop existing policies that cause self-reference issues
DROP POLICY IF EXISTS "Super-Admin and Admin can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super-Admin and Admin can update profiles" ON public.profiles; 
DROP POLICY IF EXISTS "Super-Admin and Admin can delete profiles" ON public.profiles;

-- Create new robust policies using existing security definer functions
CREATE POLICY "Secure_Admin_can_insert_profiles" ON public.profiles
FOR INSERT 
WITH CHECK (validate_admin_action(ARRAY['Admin', 'Super-Admin']));

CREATE POLICY "Secure_Admin_can_update_profiles" ON public.profiles
FOR UPDATE 
USING (validate_admin_action(ARRAY['Admin', 'Super-Admin']))
WITH CHECK (validate_admin_action(ARRAY['Admin', 'Super-Admin']));

CREATE POLICY "Secure_Admin_can_delete_profiles" ON public.profiles
FOR DELETE 
USING (validate_admin_action(ARRAY['Admin', 'Super-Admin']));

-- Tighten comprehensive_users RLS to prevent direct PII access
-- Remove the overly broad HR_Admin_full_access policy 
DROP POLICY IF EXISTS "HR_Admin_full_access_comprehensive_users" ON public.comprehensive_users;

-- Create more restrictive policy - admins should use RPC functions for data access
CREATE POLICY "Restricted_admin_comprehensive_users_access" ON public.comprehensive_users
FOR SELECT 
USING (
  -- Self-access always allowed
  auth_user_id = auth.uid() 
  OR 
  -- Super-Admin only for direct table access (not regular Admin)
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'::user_role
  ))
);

-- Note: HR and Admin users should use RPC functions like get_employee_basic_data_secure()
-- for controlled access with proper auditing and field filtering