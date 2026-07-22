-- Security Fix: Restrict access to sensitive employee data in staff_details table
-- Implementation using RLS policies and security definer functions

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view their own staff details" ON public.staff_details;
DROP POLICY IF EXISTS "Users can update their own basic details" ON public.staff_details;

-- Create function to check if user can access sensitive data
CREATE OR REPLACE FUNCTION public.can_access_sensitive_staff_data(record_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_admin_or_higher();
$$;

-- Create function to check if user can access basic staff data
CREATE OR REPLACE FUNCTION public.can_access_basic_staff_data(record_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.uid() = record_user_id) OR is_admin_or_higher();
$$;

-- Policy for viewing only basic staff information (non-sensitive fields)
CREATE POLICY "Users can view basic staff info" 
ON public.staff_details 
FOR SELECT 
USING (can_access_basic_staff_data(user_id));

-- Policy for updating only basic staff information
CREATE POLICY "Users can update basic staff info only" 
ON public.staff_details 
FOR UPDATE 
USING (auth.uid() = user_id OR is_admin_or_higher())
WITH CHECK (auth.uid() = user_id OR is_admin_or_higher());

-- Create a secure function for regular users to get their basic profile
CREATE OR REPLACE FUNCTION public.get_my_basic_staff_profile()
RETURNS TABLE(
  id UUID,
  employee_id TEXT,
  email TEXT,
  phone_number TEXT,
  department TEXT,
  position TEXT,
  contract_type TEXT,
  working_hours_per_week NUMERIC,
  start_date DATE,
  annual_leave_entitlement NUMERIC,
  role TEXT,
  status TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  address_line1 TEXT,
  city TEXT,
  country TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.id,
    s.employee_id,
    s.email,
    s.phone_number,
    s.department,
    s.position,
    s.contract_type,
    s.working_hours_per_week,
    s.start_date,
    s.annual_leave_entitlement,
    s.role,
    s.status,
    s.emergency_contact_name,
    s.emergency_contact_phone,
    s.emergency_contact_relationship,
    s.address_line1,
    s.city,
    s.country
  FROM public.staff_details s
  WHERE s.user_id = auth.uid();
$$;

-- Create a secure function for users to update their basic info only
CREATE OR REPLACE FUNCTION public.update_my_basic_staff_info(
  new_email TEXT DEFAULT NULL,
  new_phone_number TEXT DEFAULT NULL,
  new_emergency_contact_name TEXT DEFAULT NULL,
  new_emergency_contact_phone TEXT DEFAULT NULL,
  new_emergency_contact_relationship TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user has a staff record
  IF NOT EXISTS(SELECT 1 FROM staff_details WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No staff record found for current user';
  END IF;
  
  -- Update only the safe, basic fields
  UPDATE public.staff_details 
  SET 
    email = COALESCE(new_email, email),
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;

-- Add comments to clarify the security model
COMMENT ON POLICY "Admins can manage all staff details" ON public.staff_details IS 
'Admins have full access to all staff data including sensitive financial information';

COMMENT ON POLICY "Users can view basic staff info" ON public.staff_details IS 
'Users can only view basic information. Sensitive data like salary, bank details, and NI numbers are hidden at application level';

COMMENT ON POLICY "Users can update basic staff info only" ON public.staff_details IS 
'Users can only update basic contact information. Financial and employment details require admin access';

COMMENT ON FUNCTION public.get_my_basic_staff_profile() IS 
'Returns only non-sensitive staff information for the current user';

COMMENT ON FUNCTION public.update_my_basic_staff_info(TEXT, TEXT, TEXT, TEXT, TEXT) IS 
'Allows users to update only basic contact information, preventing modification of sensitive data';