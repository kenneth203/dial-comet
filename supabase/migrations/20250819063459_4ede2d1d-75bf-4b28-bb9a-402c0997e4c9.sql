-- Enhanced security functions with proper type casting
-- HR-only function to access sensitive employee data (fixed)
CREATE OR REPLACE FUNCTION public.get_sensitive_employee_data(employee_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  salary numeric,
  bank_name text,
  bank_account_number text,
  bank_sort_code text,
  ni_number text,
  date_of_birth date,
  address_line1 text,
  address_line2 text,
  postal_code text,
  contract_type text,
  working_hours_per_week numeric,
  start_date date,
  annual_leave_entitlement numeric
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.name,
    cu.salary,
    cu.bank_name,
    cu.bank_account_number,
    cu.bank_sort_code,
    cu.ni_number,
    cu.date_of_birth,
    cu.address_line1,
    cu.address_line2,
    cu.postal_code,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement
  FROM public.comprehensive_users cu
  WHERE cu.id = employee_id 
    AND can_access_sensitive_employee_data()
  LIMIT 1;
$$;

-- Function to safely update employee contact info (user can update own)
CREATE OR REPLACE FUNCTION public.update_my_contact_info(
  new_phone_number text DEFAULT NULL,
  new_emergency_contact_name text DEFAULT NULL,
  new_emergency_contact_phone text DEFAULT NULL,
  new_emergency_contact_relationship text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify user has a record
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  
  -- Update only safe contact fields
  UPDATE public.comprehensive_users 
  SET 
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE auth_user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;

-- HR-only function to update sensitive employee data
CREATE OR REPLACE FUNCTION public.update_employee_sensitive_data(
  employee_id uuid,
  new_salary numeric DEFAULT NULL,
  new_bank_name text DEFAULT NULL,
  new_bank_account_number text DEFAULT NULL,
  new_bank_sort_code text DEFAULT NULL,
  new_ni_number text DEFAULT NULL,
  new_date_of_birth date DEFAULT NULL,
  new_address_line1 text DEFAULT NULL,
  new_address_line2 text DEFAULT NULL,
  new_postal_code text DEFAULT NULL,
  new_contract_type text DEFAULT NULL,
  new_working_hours_per_week numeric DEFAULT NULL,
  new_start_date date DEFAULT NULL,
  new_annual_leave_entitlement numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only HR/Admin can access this function
  IF NOT can_access_sensitive_employee_data() THEN
    RAISE EXCEPTION 'Access denied: HR or Admin role required';
  END IF;
  
  -- Verify employee exists
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE id = employee_id) THEN
    RAISE EXCEPTION 'Employee record not found';
  END IF;
  
  -- Update sensitive fields
  UPDATE public.comprehensive_users 
  SET 
    salary = COALESCE(new_salary, salary),
    bank_name = COALESCE(new_bank_name, bank_name),
    bank_account_number = COALESCE(new_bank_account_number, bank_account_number),
    bank_sort_code = COALESCE(new_bank_sort_code, bank_sort_code),
    ni_number = COALESCE(new_ni_number, ni_number),
    date_of_birth = COALESCE(new_date_of_birth, date_of_birth),
    address_line1 = COALESCE(new_address_line1, address_line1),
    address_line2 = COALESCE(new_address_line2, address_line2),
    postal_code = COALESCE(new_postal_code, postal_code),
    contract_type = COALESCE(new_contract_type, contract_type),
    working_hours_per_week = COALESCE(new_working_hours_per_week, working_hours_per_week),
    start_date = COALESCE(new_start_date, start_date),
    annual_leave_entitlement = COALESCE(new_annual_leave_entitlement, annual_leave_entitlement),
    updated_at = NOW()
  WHERE id = employee_id;
  
  RETURN TRUE;
END;
$$;