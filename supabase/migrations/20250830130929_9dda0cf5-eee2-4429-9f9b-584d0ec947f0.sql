-- Create admin function to create holiday requests for other users
CREATE OR REPLACE FUNCTION public.create_holiday_request_admin(
  target_user_id uuid,
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
  new_request_id uuid;
  current_user_role text;
BEGIN
  -- Check if current user is admin
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can create holiday requests for other users';
  END IF;
  
  -- Get current user role for logging
  SELECT role::text INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Validate target user exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM public.system_users 
    WHERE user_id = target_user_id AND status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Target user not found or not active';
  END IF;
  
  -- Validate date range
  IF req_start_date > req_end_date THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;
  
  -- Calculate working days
  total_working_days := calculate_working_days(req_start_date, req_end_date);
  
  -- Create the holiday request
  INSERT INTO public.holiday_requests (
    user_id,
    absence_type,
    start_date,
    end_date,
    total_days,
    reason,
    status,
    created_at,
    updated_at
  ) VALUES (
    target_user_id,
    req_absence_type,
    req_start_date,
    req_end_date,
    total_working_days,
    req_reason,
    'pending'::request_status,
    now(),
    now()
  ) RETURNING id INTO new_request_id;
  
  -- Log the admin action
  INSERT INTO public.sensitive_data_access_log (
    accessed_by,
    employee_user_id,
    data_type,
    access_reason
  ) VALUES (
    auth.uid(),
    target_user_id,
    'create_holiday_request_admin',
    format('Admin (%s) created holiday request for user %s: %s from %s to %s', 
           current_user_role, target_user_id, req_absence_type, req_start_date, req_end_date)
  );
  
  RETURN new_request_id;
END;
$$;