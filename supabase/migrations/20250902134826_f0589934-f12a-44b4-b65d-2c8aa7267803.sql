-- Update the create_holiday_request_admin function to handle system users without auth accounts
CREATE OR REPLACE FUNCTION public.create_holiday_request_admin(
  target_system_user_id uuid, 
  req_start_date text, 
  req_end_date text, 
  req_absence_type absence_type, 
  req_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date_parsed date;
  end_date_parsed date;
  total_working_days numeric;
  new_request_id uuid;
  target_user_auth_id uuid;
  days_in_advance integer;
  system_user_exists boolean;
BEGIN
  -- Only admins can use this function
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can create holiday requests for other users';
  END IF;
  
  -- Check if the target system user exists
  SELECT EXISTS(SELECT 1 FROM public.system_users WHERE id = target_system_user_id) 
  INTO system_user_exists;
  
  IF NOT system_user_exists THEN
    RAISE EXCEPTION 'System user not found';
  END IF;
  
  -- Get the auth user ID for the target system user (may be NULL for system-only users)
  SELECT user_id INTO target_user_auth_id 
  FROM public.system_users 
  WHERE id = target_system_user_id 
  LIMIT 1;
  
  -- Parse and validate dates
  start_date_parsed := req_start_date::date;
  end_date_parsed := req_end_date::date;
  
  -- Basic date validation
  IF start_date_parsed > end_date_parsed THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;
  
  -- Calculate working days
  total_working_days := calculate_working_days(start_date_parsed, end_date_parsed);
  
  -- Rule 1: Check for overlapping approved holidays 
  -- Only check if target_user_auth_id is not null, otherwise skip conflict check for system-only users
  IF target_user_auth_id IS NOT NULL AND check_overlapping_holidays(start_date_parsed, end_date_parsed, target_user_auth_id) THEN
    RAISE EXCEPTION 'Another user already has approved holiday during this period. Only one person can be on holiday at a time.';
  END IF;
  
  -- Rule 2: If holiday is more than one day, must be requested at least 14 days in advance
  days_in_advance := start_date_parsed - CURRENT_DATE;
  
  IF total_working_days > 1 AND days_in_advance < 14 THEN
    RAISE EXCEPTION 'Holidays longer than one day must be requested at least 14 days in advance. You are requesting % days in advance.', days_in_advance;
  END IF;
  
  -- Create the request (user_id can be NULL for system-only users)
  INSERT INTO public.holiday_requests (
    user_id,
    system_user_id,
    start_date,
    end_date,
    total_days,
    absence_type,
    reason,
    status
  ) VALUES (
    target_user_auth_id, -- This can be NULL for system-only users
    target_system_user_id,
    start_date_parsed,
    end_date_parsed,
    total_working_days,
    req_absence_type,
    req_reason,
    'pending'::request_status
  ) RETURNING id INTO new_request_id;
  
  RETURN new_request_id;
END;
$$;