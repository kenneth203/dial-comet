-- Complete the unified user management system (Fixed for nullable auth_user_id)
-- Add remaining functions and migrate existing data with proper null handling

-- First, let me modify the table to allow nullable auth_user_id for staff-only records
ALTER TABLE public.comprehensive_users 
ALTER COLUMN auth_user_id DROP NOT NULL;

-- Create secure function for comprehensive user data (role-based filtering)
CREATE OR REPLACE FUNCTION public.get_comprehensive_user_data()
RETURNS TABLE(
  id UUID,
  auth_user_id UUID,
  name TEXT,
  email TEXT,
  phone_number TEXT,
  role TEXT,
  status TEXT,
  employee_id TEXT,
  department TEXT,
  job_position TEXT,
  contract_type TEXT,
  working_hours_per_week NUMERIC,
  start_date DATE,
  annual_leave_entitlement NUMERIC,
  city TEXT,
  country TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  is_system_user BOOLEAN,
  is_staff_member BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
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
  
  IF is_admin_user THEN
    -- Admins get all records with all non-sensitive fields
    RETURN QUERY
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
      cu.city,
      cu.country,
      cu.emergency_contact_name,
      cu.emergency_contact_phone,
      cu.emergency_contact_relationship,
      cu.is_system_user,
      cu.is_staff_member,
      cu.created_at,
      cu.updated_at
    FROM public.comprehensive_users cu
    ORDER BY cu.created_at DESC;
  ELSE
    -- Regular users get only their own record with basic fields
    RETURN QUERY
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
      cu.city,
      cu.country,
      cu.emergency_contact_name,
      cu.emergency_contact_phone,
      cu.emergency_contact_relationship,
      cu.is_system_user,
      cu.is_staff_member,
      cu.created_at,
      cu.updated_at
    FROM public.comprehensive_users cu
    WHERE cu.auth_user_id = auth.uid();
  END IF;
END;
$$;

-- Migrate existing data from system_users table
INSERT INTO public.comprehensive_users (
  auth_user_id,
  name,
  email,
  role,
  status,
  is_system_user,
  is_staff_member,
  created_at,
  updated_at
)
SELECT 
  su.user_id,
  su.name,
  su.email,
  su.role,
  su.status,
  true, -- These are system users
  false, -- Not necessarily staff members
  su.created_at,
  su.updated_at
FROM public.system_users su
WHERE NOT EXISTS (
  SELECT 1 FROM public.comprehensive_users cu 
  WHERE cu.auth_user_id = su.user_id
);

-- Migrate existing data from staff_details table (handle null user_id)
INSERT INTO public.comprehensive_users (
  auth_user_id,
  name,
  email,
  phone_number,
  role,
  status,
  employee_id,
  department,
  job_position,
  contract_type,
  working_hours_per_week,
  start_date,
  annual_leave_entitlement,
  date_of_birth,
  ni_number,
  address_line1,
  address_line2,
  city,
  postal_code,
  country,
  emergency_contact_name,
  emergency_contact_phone,
  emergency_contact_relationship,
  salary,
  bank_name,
  bank_account_number,
  bank_sort_code,
  is_system_user,
  is_staff_member,
  created_at,
  updated_at
)
SELECT 
  sd.user_id, -- Can be null for staff-only records
  COALESCE(sd.employee_id || ' ' || sd."position", 'Staff Member'),
  COALESCE(sd.email, 'staff@example.com'),
  sd.phone_number,
  COALESCE(sd.role, 'Operator'),
  COALESCE(sd.status, 'Active'),
  sd.employee_id,
  sd.department,
  sd."position",
  sd.contract_type,
  sd.working_hours_per_week,
  sd.start_date,
  sd.annual_leave_entitlement,
  sd.date_of_birth,
  sd.ni_number,
  sd.address_line1,
  sd.address_line2,
  sd.city,
  sd.postal_code,
  sd.country,
  sd.emergency_contact_name,
  sd.emergency_contact_phone,
  sd.emergency_contact_relationship,
  sd.salary,
  sd.bank_name,
  sd.bank_account_number,
  sd.bank_sort_code,
  COALESCE(sd.is_system_user, false),
  true, -- These are staff members
  sd.created_at,
  sd.updated_at
FROM public.staff_details sd
WHERE sd.user_id IS NULL 
   OR NOT EXISTS (
  SELECT 1 FROM public.comprehensive_users cu 
  WHERE cu.auth_user_id = sd.user_id
);

-- Update records that exist in both tables (merge the data)
UPDATE public.comprehensive_users cu
SET 
  employee_id = COALESCE(sd.employee_id, cu.employee_id),
  department = COALESCE(sd.department, cu.department),
  job_position = COALESCE(sd."position", cu.job_position),
  contract_type = COALESCE(sd.contract_type, cu.contract_type),
  working_hours_per_week = COALESCE(sd.working_hours_per_week, cu.working_hours_per_week),
  start_date = COALESCE(sd.start_date, cu.start_date),
  annual_leave_entitlement = COALESCE(sd.annual_leave_entitlement, cu.annual_leave_entitlement),
  date_of_birth = COALESCE(sd.date_of_birth, cu.date_of_birth),
  ni_number = COALESCE(sd.ni_number, cu.ni_number),
  address_line1 = COALESCE(sd.address_line1, cu.address_line1),
  address_line2 = COALESCE(sd.address_line2, cu.address_line2),
  city = COALESCE(sd.city, cu.city),
  postal_code = COALESCE(sd.postal_code, cu.postal_code),
  country = COALESCE(sd.country, cu.country),
  emergency_contact_name = COALESCE(sd.emergency_contact_name, cu.emergency_contact_name),
  emergency_contact_phone = COALESCE(sd.emergency_contact_phone, cu.emergency_contact_phone),
  emergency_contact_relationship = COALESCE(sd.emergency_contact_relationship, cu.emergency_contact_relationship),
  salary = COALESCE(sd.salary, cu.salary),
  bank_name = COALESCE(sd.bank_name, cu.bank_name),
  bank_account_number = COALESCE(sd.bank_account_number, cu.bank_account_number),
  bank_sort_code = COALESCE(sd.bank_sort_code, cu.bank_sort_code),
  is_staff_member = true,
  phone_number = COALESCE(sd.phone_number, cu.phone_number)
FROM public.staff_details sd
WHERE cu.auth_user_id = sd.user_id AND sd.user_id IS NOT NULL;