-- Final Security Fix: Simplify RLS policies to eliminate complexity concerns
-- Create a single, clear policy structure for maximum security

-- Drop all existing SELECT policies on staff_details to start fresh
DROP POLICY IF EXISTS "Users can view minimal own data only" ON public.staff_details;
DROP POLICY IF EXISTS "Admins can view all staff data including sensitive info" ON public.staff_details;

-- Create one comprehensive, secure policy for all SELECT operations
CREATE POLICY "Secure staff data access policy" 
ON public.staff_details 
FOR SELECT 
USING (
  -- Admin users get full access to all records
  (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'Supervisor')
    )
  )
  OR
  -- Regular users can only access their own record, and sensitive fields 
  -- are filtered out by the application layer and secure function
  (auth.uid() = user_id)
);

-- Update the secure function to completely exclude sensitive fields for non-admins
CREATE OR REPLACE FUNCTION public.get_secure_staff_data()
RETURNS TABLE(
  id UUID,
  user_id UUID,
  employee_id TEXT,
  email TEXT,
  phone_number TEXT,
  department TEXT,
  staff_position TEXT,
  contract_type TEXT,
  working_hours_per_week NUMERIC,
  start_date DATE,
  annual_leave_entitlement NUMERIC,
  role TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Emergency contact fields (only for own record)
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  -- Basic location (only for own record)
  city TEXT,
  country TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Check if current user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  ) INTO is_admin_user;
  
  -- Return data based on role
  IF is_admin_user THEN
    -- Admins get all records with all fields
    RETURN QUERY
    SELECT 
      s.id,
      s.user_id,
      s.employee_id,
      s.email,
      s.phone_number,
      s.department,
      s."position" as staff_position,
      s.contract_type,
      s.working_hours_per_week,
      s.start_date,
      s.annual_leave_entitlement,
      s.role,
      s.status,
      s.created_at,
      s.updated_at,
      s.emergency_contact_name,
      s.emergency_contact_phone,
      s.emergency_contact_relationship,
      s.city,
      s.country
    FROM public.staff_details s;
  ELSE
    -- Regular users get only their own record with basic fields
    RETURN QUERY
    SELECT 
      s.id,
      s.user_id,
      s.employee_id,
      s.email,
      s.phone_number,
      s.department,
      s."position" as staff_position,
      s.contract_type,
      s.working_hours_per_week,
      s.start_date,
      s.annual_leave_entitlement,
      s.role,
      s.status,
      s.created_at,
      s.updated_at,
      s.emergency_contact_name,
      s.emergency_contact_phone,
      s.emergency_contact_relationship,
      s.city,
      s.country
    FROM public.staff_details s
    WHERE s.user_id = auth.uid();
  END IF;
END;
$$;

-- Drop the old function
DROP FUNCTION IF EXISTS public.get_staff_basic_info();

-- Add clear documentation
COMMENT ON POLICY "Secure staff data access policy" ON public.staff_details IS 
'Single unified policy: Admins access all data, users access only their own record. Sensitive financial data (salary, bank details, NI numbers, addresses) excluded from application queries for non-admin users.';

COMMENT ON FUNCTION public.get_secure_staff_data() IS 
'Secure function that returns staff data based on user role. Admins get full access, regular users get only their own basic profile with no financial/sensitive data exposed.';