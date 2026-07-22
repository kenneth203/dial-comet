-- Fix Security Definer View Issue (Fixed reserved word issue)
-- Remove the problematic view and use application-level filtering

-- Drop the security definer view if it exists
DROP VIEW IF EXISTS public.staff_basic_view;

-- Create a secure function that returns only basic staff info for regular users
CREATE OR REPLACE FUNCTION public.get_staff_basic_info()
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
  city TEXT,
  country TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Only return location for user's own record
    CASE WHEN s.user_id = auth.uid() THEN s.city ELSE NULL END as city,
    CASE WHEN s.user_id = auth.uid() THEN s.country ELSE NULL END as country,
    -- Only return emergency contact for user's own record
    CASE WHEN s.user_id = auth.uid() THEN s.emergency_contact_name ELSE NULL END as emergency_contact_name,
    CASE WHEN s.user_id = auth.uid() THEN s.emergency_contact_phone ELSE NULL END as emergency_contact_phone,
    CASE WHEN s.user_id = auth.uid() THEN s.emergency_contact_relationship ELSE NULL END as emergency_contact_relationship
  FROM public.staff_details s
  WHERE 
    -- Admin users can see all records
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'Supervisor')
    )
    OR 
    -- Regular users can only see their own record
    s.user_id = auth.uid();
$$;

-- Update RLS policies to be more restrictive
DROP POLICY IF EXISTS "Users can view own basic profile only" ON public.staff_details;

-- Create extremely restrictive policy for non-admin users
CREATE POLICY "Users can view minimal own data only" 
ON public.staff_details 
FOR SELECT 
USING (
  auth.uid() = user_id AND 
  NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
);

-- Add security documentation
COMMENT ON FUNCTION public.get_staff_basic_info() IS 
'Returns only non-sensitive staff information. Sensitive data like salary, bank details, NI numbers completely excluded. Emergency contacts only for own record.';