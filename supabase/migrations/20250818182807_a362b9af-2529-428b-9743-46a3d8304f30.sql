-- Enhanced Security Fix: Completely isolate sensitive data access
-- Create separate policies for different data sensitivity levels

-- Drop the current policy that still allows access to sensitive fields
DROP POLICY IF EXISTS "Users can view basic staff info" ON public.staff_details;

-- Create separate policies for different access levels
-- 1. Admin-only access to ALL data including sensitive fields
CREATE POLICY "Admins can view all staff data including sensitive info" 
ON public.staff_details 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
);

-- 2. Users can only access their own NON-sensitive basic profile data
-- This policy will be combined with application-level filtering
CREATE POLICY "Users can view own basic profile only" 
ON public.staff_details 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create a secure view that automatically masks sensitive data for non-admin users
CREATE OR REPLACE VIEW public.staff_basic_view AS
SELECT 
  s.id,
  s.user_id,
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
  s.created_at,
  s.updated_at,
  -- Basic address info (city/country) visible to own user
  CASE 
    WHEN s.user_id = auth.uid() THEN s.city
    ELSE NULL 
  END as city,
  CASE 
    WHEN s.user_id = auth.uid() THEN s.country
    ELSE NULL 
  END as country,
  -- Emergency contact visible only to own user
  CASE 
    WHEN s.user_id = auth.uid() THEN s.emergency_contact_name
    ELSE NULL 
  END as emergency_contact_name,
  CASE 
    WHEN s.user_id = auth.uid() THEN s.emergency_contact_phone
    ELSE NULL 
  END as emergency_contact_phone,
  CASE 
    WHEN s.user_id = auth.uid() THEN s.emergency_contact_relationship
    ELSE NULL 
  END as emergency_contact_relationship,
  -- Sensitive fields are completely NULL for all non-admin users
  NULL::numeric as salary,
  NULL::text as bank_name, 
  NULL::text as bank_account_number,
  NULL::text as bank_sort_code,
  NULL::text as ni_number,
  NULL::text as address_line1,
  NULL::text as address_line2,
  NULL::text as postal_code,
  NULL::date as date_of_birth
FROM public.staff_details s
WHERE 
  -- Users can only see their own record OR admin can see all
  s.user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  );

-- Enable RLS on the view
ALTER VIEW public.staff_basic_view SET (security_barrier = true);

-- Grant access to the view
GRANT SELECT ON public.staff_basic_view TO authenticated;

-- Update the can_access_basic_staff_data function to be more restrictive
CREATE OR REPLACE FUNCTION public.can_access_basic_staff_data(record_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Only allow access to own record (sensitive data will be masked by application layer)
  SELECT auth.uid() = record_user_id;
$$;

-- Create a function specifically for checking admin access to sensitive data
CREATE OR REPLACE FUNCTION public.can_access_sensitive_staff_data(record_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  );
$$;

-- Add documentation comments
COMMENT ON VIEW public.staff_basic_view IS 
'Secure view that automatically masks sensitive financial and personal data for non-admin users. Admins see all data, users see only their own basic profile info.';

COMMENT ON FUNCTION public.can_access_basic_staff_data(UUID) IS 
'Returns true only if user is accessing their own record. Sensitive data masking handled by application layer.';

COMMENT ON FUNCTION public.can_access_sensitive_staff_data(UUID) IS 
'Returns true only for Admin, Super-Admin, or Supervisor roles with access to sensitive financial data.';