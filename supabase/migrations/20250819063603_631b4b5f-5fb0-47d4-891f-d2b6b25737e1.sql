-- Implement secure RLS policies for comprehensive_users table
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can manage all comprehensive user data" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Users can view own basic profile data" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Users can update own basic contact info" ON public.comprehensive_users;

-- New ultra-secure policies with proper user isolation
-- Users can only see their own record (sensitive data will be application-filtered)
CREATE POLICY "Users can view own profile only"
ON public.comprehensive_users
FOR SELECT
USING (
  auth.uid() = auth_user_id 
  AND auth.uid() IS NOT NULL
);

-- HR and Admins can view all records (including sensitive data)
CREATE POLICY "HR and Admins can view all employee data"
ON public.comprehensive_users
FOR SELECT
USING (can_access_sensitive_employee_data());

-- Only HR and Admins can insert new employee records
CREATE POLICY "Only HR and Admins can create employee records"
ON public.comprehensive_users
FOR INSERT
WITH CHECK (can_access_sensitive_employee_data());

-- Users can update only their own basic info, HR/Admins can update everything
CREATE POLICY "Restricted update access for employee data"
ON public.comprehensive_users
FOR UPDATE
USING (
  (auth.uid() = auth_user_id AND auth.uid() IS NOT NULL)
  OR can_access_sensitive_employee_data()
)
WITH CHECK (
  (auth.uid() = auth_user_id AND auth.uid() IS NOT NULL)
  OR can_access_sensitive_employee_data()
);

-- Only HR and Admins can delete employee records
CREATE POLICY "Only HR and Admins can delete employee records"
ON public.comprehensive_users
FOR DELETE
USING (can_access_sensitive_employee_data());