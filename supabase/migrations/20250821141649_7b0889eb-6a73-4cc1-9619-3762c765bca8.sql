-- Fix security issue: Add policy to allow users to access their own data
-- while maintaining strict admin-only access for other users' data

-- Add permissive policy to allow users to read their own comprehensive_users record
CREATE POLICY "Users can view their own comprehensive_users record" 
ON public.comprehensive_users 
FOR SELECT 
USING (auth.uid() = auth_user_id);

-- Add permissive policy to allow users to update their own basic information
-- (excluding sensitive fields like salary, role, etc.)
CREATE POLICY "Users can update their own basic comprehensive_users info" 
ON public.comprehensive_users 
FOR UPDATE 
USING (auth.uid() = auth_user_id)
WITH CHECK (
  auth.uid() = auth_user_id AND
  -- Ensure users cannot modify sensitive fields
  (NEW.role = OLD.role) AND
  (NEW.status = OLD.status) AND
  (NEW.employee_id = OLD.employee_id) AND
  (NEW.department = OLD.department) AND
  (NEW.job_position = OLD.job_position) AND
  (NEW.contract_type = OLD.contract_type) AND
  (NEW.start_date = OLD.start_date) AND
  (NEW.annual_leave_entitlement = OLD.annual_leave_entitlement) AND
  (NEW.working_hours_per_week = OLD.working_hours_per_week) AND
  (NEW.line_manager_id = OLD.line_manager_id) AND
  (NEW.is_system_user = OLD.is_system_user) AND
  (NEW.is_staff_member = OLD.is_staff_member)
);

-- Add a function to get current user's comprehensive data safely
CREATE OR REPLACE FUNCTION public.get_my_comprehensive_profile()
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
  contract_type text,
  working_hours_per_week numeric,
  start_date date,
  annual_leave_entitlement numeric,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text,
  is_system_user boolean,
  is_staff_member boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.address_line1,
    cu.address_line2,
    cu.city,
    cu.postal_code,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid()
  LIMIT 1;
$$;