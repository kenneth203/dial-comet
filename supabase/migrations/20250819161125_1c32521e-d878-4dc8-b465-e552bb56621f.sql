-- Fix remaining PLPGSQL functions with proper search_path settings

CREATE OR REPLACE FUNCTION public.update_my_staff_basic_info(new_phone_number text DEFAULT NULL::text, new_emergency_contact_name text DEFAULT NULL::text, new_emergency_contact_phone text DEFAULT NULL::text, new_emergency_contact_relationship text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify user has a staff record
  IF NOT EXISTS(SELECT 1 FROM staff_details WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No staff record found for current user';
  END IF;
  
  -- Update only safe, non-sensitive fields
  UPDATE public.staff_details 
  SET 
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_basic_staff_info(new_email text DEFAULT NULL::text, new_phone_number text DEFAULT NULL::text, new_emergency_contact_name text DEFAULT NULL::text, new_emergency_contact_phone text DEFAULT NULL::text, new_emergency_contact_relationship text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.get_employee_financial_data(employee_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(user_id uuid, salary numeric, bank_name text, bank_account_number text, bank_sort_code text, ni_number text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only HR and Super-Admin can access financial data
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'HR')
    ) THEN
        RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can access financial data';
    END IF;
    
    -- Log the access
    INSERT INTO public.sensitive_data_audit (
        accessed_by,
        employee_id,
        action
    ) VALUES (
        auth.uid(),
        employee_user_id::text,
        'VIEW_FINANCIAL_DATA'
    );
    
    -- Update last access tracking
    UPDATE public.employee_financial_data 
    SET 
        last_accessed_by = auth.uid(),
        last_accessed_at = NOW()
    WHERE employee_financial_data.user_id = employee_user_id;
    
    -- Return the data
    RETURN QUERY
    SELECT 
        efd.user_id,
        efd.salary,
        efd.bank_name,
        efd.bank_account_number,
        efd.bank_sort_code,
        efd.ni_number,
        efd.created_at,
        efd.updated_at
    FROM public.employee_financial_data efd
    WHERE efd.user_id = employee_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_secure_staff_data()
RETURNS TABLE(id uuid, user_id uuid, employee_id text, email text, phone_number text, department text, staff_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, role text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, city text, country text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.update_employee_financial_data(employee_user_id uuid, new_salary numeric DEFAULT NULL::numeric, new_bank_name text DEFAULT NULL::text, new_bank_account_number text DEFAULT NULL::text, new_bank_sort_code text DEFAULT NULL::text, new_ni_number text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only HR and Super-Admin can update financial data
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'HR')
    ) THEN
        RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can modify financial data';
    END IF;

    -- Insert or update financial data
    INSERT INTO public.employee_financial_data (
        user_id, salary, bank_name, bank_account_number, bank_sort_code, ni_number
    ) VALUES (
        employee_user_id, new_salary, new_bank_name, new_bank_account_number, new_bank_sort_code, new_ni_number
    )
    ON CONFLICT (user_id) DO UPDATE SET
        salary = COALESCE(new_salary, employee_financial_data.salary),
        bank_name = COALESCE(new_bank_name, employee_financial_data.bank_name),
        bank_account_number = COALESCE(new_bank_account_number, employee_financial_data.bank_account_number),
        bank_sort_code = COALESCE(new_bank_sort_code, employee_financial_data.bank_sort_code),
        ni_number = COALESCE(new_ni_number, employee_financial_data.ni_number),
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_basic_user_info(user_uuid uuid, new_phone_number text DEFAULT NULL::text, new_emergency_contact_name text DEFAULT NULL::text, new_emergency_contact_phone text DEFAULT NULL::text, new_emergency_contact_relationship text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if user is updating their own record or is admin
  IF auth.uid() != user_uuid AND NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: can only update own profile';
  END IF;
  
  -- Verify user record exists
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE auth_user_id = user_uuid) THEN
    RAISE EXCEPTION 'User record not found';
  END IF;
  
  -- Update only safe, basic fields
  UPDATE public.comprehensive_users 
  SET 
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE auth_user_id = user_uuid;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_basic_profile_data()
RETURNS TABLE(id uuid, name text, email text, phone_number text, role text, status text, department text, job_position text, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only return basic, non-sensitive fields for the authenticated user
  RETURN QUERY
  SELECT 
    cu.id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_employee_financial_data_secure(employee_user_id uuid)
RETURNS TABLE(user_id uuid, salary numeric, bank_name text, bank_account_number text, bank_sort_code text, ni_number text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  accessor_role text;
BEGIN
  -- Get current user role
  SELECT role::text INTO accessor_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Only Super-Admin and HR can access financial data
  IF accessor_role NOT IN ('Super-Admin', 'HR') THEN
    -- Log unauthorized access attempt
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      ip_address
    ) VALUES (
      auth.uid(),
      employee_user_id::text,
      'UNAUTHORIZED_FINANCIAL_ACCESS_ATTEMPT',
      NULL
    );
    
    RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can access financial data';
  END IF;
  
  -- Log authorized access
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action
  ) VALUES (
    auth.uid(),
    employee_user_id::text,
    'VIEW_FINANCIAL_DATA'
  );
  
  -- Update last access tracking
  UPDATE public.employee_financial_data 
  SET 
    last_accessed_by = auth.uid(),
    last_accessed_at = NOW()
  WHERE employee_financial_data.user_id = employee_user_id;
  
  -- Return the data
  RETURN QUERY
  SELECT 
    efd.user_id,
    efd.salary,
    efd.bank_name,
    efd.bank_account_number,
    efd.bank_sort_code,
    efd.ni_number,
    efd.created_at,
    efd.updated_at
  FROM public.employee_financial_data efd
  WHERE efd.user_id = employee_user_id;
END;
$$;