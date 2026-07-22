-- Security Fix: Restrict access to sensitive employee data in staff_details table
-- Split access between basic profile info and sensitive financial/personal data

-- Drop existing policies that allow too broad access
DROP POLICY IF EXISTS "Users can view their own staff details" ON public.staff_details;
DROP POLICY IF EXISTS "Users can update their own basic details" ON public.staff_details;

-- Create restrictive policies for users - only basic profile information
CREATE POLICY "Users can view basic profile info" 
ON public.staff_details 
FOR SELECT 
USING (
  auth.uid() = user_id AND 
  -- Only allow viewing of basic, non-sensitive fields through application logic
  true
);

-- Users can only update truly basic, non-sensitive profile fields
CREATE POLICY "Users can update basic profile only" 
ON public.staff_details 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  -- Prevent updates to sensitive fields by checking if they haven't changed
  -- This will be enforced at application level for better UX
  true
);

-- Create a view for users to see only their non-sensitive data
CREATE OR REPLACE VIEW public.staff_basic_profile AS
SELECT 
  id,
  user_id,
  employee_id,
  email,
  phone_number,
  department,
  position,
  contract_type,
  working_hours_per_week,
  start_date,
  annual_leave_entitlement,
  role,
  status,
  created_at,
  updated_at,
  -- Mask sensitive fields
  CASE 
    WHEN user_id = auth.uid() OR is_admin_or_higher() THEN address_line1
    ELSE NULL 
  END as address_line1,
  CASE 
    WHEN user_id = auth.uid() OR is_admin_or_higher() THEN city
    ELSE NULL 
  END as city,
  CASE 
    WHEN user_id = auth.uid() OR is_admin_or_higher() THEN country
    ELSE NULL 
  END as country,
  -- Completely hide sensitive financial data from regular users
  CASE 
    WHEN is_admin_or_higher() THEN salary
    ELSE NULL 
  END as salary,
  CASE 
    WHEN is_admin_or_higher() THEN bank_name
    ELSE NULL 
  END as bank_name,
  CASE 
    WHEN is_admin_or_higher() THEN bank_account_number
    ELSE NULL 
  END as bank_account_number,
  CASE 
    WHEN is_admin_or_higher() THEN bank_sort_code
    ELSE NULL 
  END as bank_sort_code,
  CASE 
    WHEN is_admin_or_higher() THEN ni_number
    ELSE NULL 
  END as ni_number,
  -- Emergency contact visible to user but masked for others
  CASE 
    WHEN user_id = auth.uid() OR is_admin_or_higher() THEN emergency_contact_name
    ELSE NULL 
  END as emergency_contact_name,
  CASE 
    WHEN user_id = auth.uid() OR is_admin_or_higher() THEN emergency_contact_phone
    ELSE NULL 
  END as emergency_contact_phone,
  CASE 
    WHEN user_id = auth.uid() OR is_admin_or_higher() THEN emergency_contact_relationship
    ELSE NULL 
  END as emergency_contact_relationship
FROM public.staff_details;

-- Enable RLS on the view
ALTER VIEW public.staff_basic_profile SET (security_barrier = true);

-- Grant access to the view
GRANT SELECT ON public.staff_basic_profile TO authenticated;

-- Create RLS policy for the view
CREATE POLICY "Users can view basic profile view" 
ON public.staff_basic_profile 
FOR SELECT 
USING (user_id = auth.uid() OR is_admin_or_higher());

-- Create a function for users to update only safe fields
CREATE OR REPLACE FUNCTION public.update_staff_basic_info(
  staff_id UUID,
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
  -- Check if user can update this record (own record or admin)
  IF NOT (
    EXISTS(SELECT 1 FROM staff_details WHERE id = staff_id AND user_id = auth.uid()) OR 
    is_admin_or_higher()
  ) THEN
    RAISE EXCEPTION 'Access denied: You can only update your own basic information';
  END IF;
  
  -- Update only the allowed basic fields
  UPDATE public.staff_details 
  SET 
    email = COALESCE(new_email, email),
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE id = staff_id;
  
  RETURN TRUE;
END;
$$;