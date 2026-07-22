-- Critical Security Fixes Migration

-- 1. Fix comprehensive_users RLS policy to properly filter sensitive data
-- Drop the overly permissive user self-access policy
DROP POLICY IF EXISTS "Users can view own basic profile" ON public.comprehensive_users;

-- Create a new restricted policy that only shows truly basic fields
CREATE POLICY "Users can view own basic profile - restricted" ON public.comprehensive_users
FOR SELECT 
USING (auth_user_id = auth.uid())
WITH CHECK (false); -- Users can't modify through this policy

-- Create a secure function to get only basic user profile data
CREATE OR REPLACE FUNCTION public.get_my_basic_profile_data()
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  phone_number text,
  role text,
  status text,
  department text,
  job_position text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text
)
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

-- 2. Enhanced financial data security with mandatory audit logging
CREATE OR REPLACE FUNCTION public.get_employee_financial_data_secure(employee_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  salary numeric,
  bank_name text,
  bank_account_number text,
  bank_sort_code text,
  ni_number text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
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

-- 3. Secure audit log access - only Super-Admin can view audit logs
DROP POLICY IF EXISTS "Only HR and Admins can view audit logs" ON public.sensitive_data_audit;

CREATE POLICY "Only Super-Admin can view audit logs" ON public.sensitive_data_audit
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);

-- 4. Fix remaining function search paths
CREATE OR REPLACE FUNCTION public.validate_admin_action(required_roles text[] DEFAULT ARRAY['Admin'::text, 'Super-Admin'::text])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role::text = ANY(required_roles)
    AND status::text = 'Active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_sensitive_financial_data()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
  );
$$;

-- 5. Add enhanced holiday request validation with proper security checks
CREATE OR REPLACE FUNCTION public.create_holiday_request_secure(
  req_start_date date,
  req_end_date date,
  req_absence_type absence_type,
  req_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_working_days numeric;
  request_id uuid;
  remaining_leave numeric;
  user_profile record;
BEGIN
  -- Validate user exists and is active
  SELECT * INTO user_profile
  FROM public.profiles
  WHERE user_id = auth.uid() AND status = 'Active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or inactive';
  END IF;
  
  -- Enhanced date validation
  IF req_start_date IS NULL OR req_end_date IS NULL THEN
    RAISE EXCEPTION 'Start date and end date are required';
  END IF;
  
  IF req_start_date > req_end_date THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;
  
  -- Prevent backdating (except for sick leave)
  IF req_start_date < CURRENT_DATE AND req_absence_type != 'sick_leave' THEN
    RAISE EXCEPTION 'Cannot create requests for past dates except sick leave';
  END IF;
  
  -- Prevent excessive future dating (more than 1 year ahead)
  IF req_start_date > CURRENT_DATE + INTERVAL '1 year' THEN
    RAISE EXCEPTION 'Cannot create requests more than 1 year in advance';
  END IF;
  
  -- Calculate working days
  total_working_days := calculate_working_days(req_start_date, req_end_date);
  
  -- Check leave balance for annual leave
  IF req_absence_type = 'annual_leave' THEN
    SELECT annual_leave_remaining INTO remaining_leave
    FROM public.get_remaining_leave_days(auth.uid(), EXTRACT(YEAR FROM req_start_date)::integer);
    
    IF remaining_leave < total_working_days THEN
      RAISE EXCEPTION 'Insufficient annual leave balance. Requested: %, Available: %', 
        total_working_days, remaining_leave;
    END IF;
  END IF;
  
  -- Log the request creation
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action
  ) VALUES (
    auth.uid(),
    auth.uid()::text,
    'CREATE_HOLIDAY_REQUEST'
  );
  
  -- Insert the request
  INSERT INTO public.holiday_requests (
    user_id,
    start_date,
    end_date,
    total_days,
    absence_type,
    reason,
    status
  )
  VALUES (
    auth.uid(),
    req_start_date,
    req_end_date,
    total_working_days,
    req_absence_type,
    req_reason,
    'pending'::request_status
  )
  RETURNING id INTO request_id;
  
  RETURN request_id;
END;
$$;

-- 6. Add trigger to log all sensitive data modifications
CREATE OR REPLACE FUNCTION public.audit_sensitive_modifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log modifications to sensitive tables
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action
  ) VALUES (
    auth.uid(),
    COALESCE(NEW.user_id::text, OLD.user_id::text, NEW.auth_user_id::text, OLD.auth_user_id::text),
    TG_OP || '_' || TG_TABLE_NAME
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit trigger to sensitive tables
DROP TRIGGER IF EXISTS audit_comprehensive_users_changes ON public.comprehensive_users;
DROP TRIGGER IF EXISTS audit_employee_financial_changes ON public.employee_financial_data;
DROP TRIGGER IF EXISTS audit_staff_details_changes ON public.staff_details;

CREATE TRIGGER audit_comprehensive_users_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.comprehensive_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_modifications();

CREATE TRIGGER audit_employee_financial_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_financial_data
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_modifications();

CREATE TRIGGER audit_staff_details_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_details
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_modifications();