-- Fix remaining trigger and helper functions with proper search_path settings

CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create default holiday entitlement for the current year
  INSERT INTO public.holiday_entitlements (
    user_id,
    year,
    annual_leave_days,
    sick_leave_days,
    personal_days,
    carried_over_days
  )
  VALUES (
    NEW.user_id,
    EXTRACT(YEAR FROM NOW())::integer,
    25.0,  -- Default annual leave days
    10.0,  -- Default sick leave days
    5.0,   -- Default personal days
    0.0    -- No carried over days for new users
  );
  
  -- Create default staff details record
  INSERT INTO public.staff_details (
    user_id,
    contract_type,
    working_hours_per_week,
    country
  )
  VALUES (
    NEW.user_id,
    'full_time',
    37.5,
    'United Kingdom'
  );
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_financial_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Log any modification to financial data
    INSERT INTO public.sensitive_data_audit (
        accessed_by,
        employee_id,
        action
    ) VALUES (
        auth.uid(),
        COALESCE(NEW.user_id::text, OLD.user_id::text),
        TG_OP || '_FINANCIAL_DATA'
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only log actual data changes, not just queries
  IF TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      ip_address
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.employee_id::text, OLD.employee_id::text, NEW.user_id::text, OLD.user_id::text),
      TG_OP || '_' || TG_TABLE_NAME,
      NULL  -- IP will be captured at application level
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_holiday_request(req_start_date date, req_end_date date, req_absence_type absence_type, req_reason text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_working_days numeric;
  request_id uuid;
BEGIN
  -- Validate dates
  IF req_start_date IS NULL OR req_end_date IS NULL THEN
    RAISE EXCEPTION 'Start date and end date are required';
  END IF;
  
  IF req_start_date > req_end_date THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;
  
  IF req_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot create requests for past dates';
  END IF;
  
  -- Calculate working days
  total_working_days := calculate_working_days(req_start_date, req_end_date);
  
  -- Insert the request (only for authenticated user)
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

CREATE OR REPLACE FUNCTION public.update_holiday_request(request_id uuid, new_start_date date DEFAULT NULL::date, new_end_date date DEFAULT NULL::date, new_absence_type absence_type DEFAULT NULL::absence_type, new_reason text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_request holiday_requests%ROWTYPE;
  total_working_days numeric;
BEGIN
  -- Get current request and verify ownership
  SELECT * INTO current_request 
  FROM public.holiday_requests 
  WHERE id = request_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday request not found or access denied';
  END IF;
  
  -- Only allow updates to pending requests
  IF current_request.status != 'pending'::request_status THEN
    RAISE EXCEPTION 'Can only update pending requests';
  END IF;
  
  -- Use current values if new ones not provided
  new_start_date := COALESCE(new_start_date, current_request.start_date);
  new_end_date := COALESCE(new_end_date, current_request.end_date);
  new_absence_type := COALESCE(new_absence_type, current_request.absence_type);
  new_reason := COALESCE(new_reason, current_request.reason);
  
  -- Validate dates
  IF new_start_date > new_end_date THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;
  
  IF new_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot set start date to past dates';
  END IF;
  
  -- Calculate new working days
  total_working_days := calculate_working_days(new_start_date, new_end_date);
  
  -- Update the request
  UPDATE public.holiday_requests 
  SET 
    start_date = new_start_date,
    end_date = new_end_date,
    total_days = total_working_days,
    absence_type = new_absence_type,
    reason = new_reason,
    updated_at = NOW()
  WHERE id = request_id AND user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_holiday_request_secure(req_start_date date, req_end_date date, req_absence_type absence_type, req_reason text DEFAULT NULL::text)
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

CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(employee_id text, action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action
  ) VALUES (
    auth.uid(),
    employee_id,
    action
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_basic_profile(new_phone_number text DEFAULT NULL::text, new_emergency_contact_name text DEFAULT NULL::text, new_emergency_contact_phone text DEFAULT NULL::text, new_emergency_contact_relationship text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify user has a record
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No user record found';
  END IF;
  
  -- Update only safe, non-sensitive fields
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, status)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email), 
    'Operator',
    'Active'
  );
  RETURN NEW;
END;
$$;