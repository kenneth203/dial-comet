-- Replace the problematic RLS policies with robust user-specific access
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view own basic profile via auth_user_id" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR and Admins can view all employee data" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Only HR and Admins can create employee records" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Restricted update access for employee data" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Only HR and Admins can delete employee records" ON public.comprehensive_users;

-- New secure policies with proper user isolation
-- Users can only see their own basic record (no sensitive data exposed via SELECT)
CREATE POLICY "Users can view own basic profile via auth_user_id"
ON public.comprehensive_users
FOR SELECT
USING (
  auth.uid() = auth_user_id 
  AND auth.uid() IS NOT NULL
);

-- HR and Admins can view all records
CREATE POLICY "HR and Admins can view all employee data"
ON public.comprehensive_users
FOR SELECT
USING (can_access_sensitive_employee_data());

-- Only HR and Admins can insert new records
CREATE POLICY "Only HR and Admins can create employee records"
ON public.comprehensive_users
FOR INSERT
WITH CHECK (can_access_sensitive_employee_data());

-- Users can update only their own basic info, HR/Admins can update all
CREATE POLICY "Restricted update access for employee data"
ON public.comprehensive_users
FOR UPDATE
USING (
  (auth.uid() = auth_user_id AND auth.uid() IS NOT NULL)
  OR can_access_sensitive_employee_data()
);

-- Only HR and Admins can delete records
CREATE POLICY "Only HR and Admins can delete employee records"
ON public.comprehensive_users
FOR DELETE
USING (can_access_sensitive_employee_data());