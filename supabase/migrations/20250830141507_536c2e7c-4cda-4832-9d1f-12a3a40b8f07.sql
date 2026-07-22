-- Drop the existing functions to avoid overloading conflicts
DROP FUNCTION IF EXISTS public.create_holiday_request_admin(uuid, date, date, absence_type, text);
DROP FUNCTION IF EXISTS public.create_holiday_request_admin(uuid, text, text, absence_type, text);

-- Recreate the admin function with consistent parameter types
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
SET search_path TO 'public'
AS $$
DECLARE
  start_date_parsed date;
  end_date_parsed date;
  total_working_days numeric;
  new_request_id uuid;
  target_user_auth_id uuid;
  days_in_advance integer;
BEGIN
  -- Only admins can use this function
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can create holiday requests for other users';
  END IF;
  
  -- Get the auth user ID for the target system user
  SELECT user_id INTO target_user_auth_id 
  FROM public.system_users 
  WHERE id = target_system_user_id 
  LIMIT 1;
  
  IF target_user_auth_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
  
  -- Parse and validate dates
  start_date_parsed := req_start_date::date;
  end_date_parsed := req_end_date::date;
  
  -- Basic date validation
  IF start_date_parsed > end_date_parsed THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;
  
  -- Calculate working days
  total_working_days := calculate_working_days(start_date_parsed, end_date_parsed);
  
  -- Rule 1: Check for overlapping approved holidays (exclude the target user in case this is an update)
  IF check_overlapping_holidays(start_date_parsed, end_date_parsed, target_user_auth_id) THEN
    RAISE EXCEPTION 'Another user already has approved holiday during this period. Only one person can be on holiday at a time.';
  END IF;
  
  -- Rule 2: If holiday is more than one day, must be requested at least 14 days in advance
  days_in_advance := start_date_parsed - CURRENT_DATE;
  
  IF total_working_days > 1 AND days_in_advance < 14 THEN
    RAISE EXCEPTION 'Holidays longer than one day must be requested at least 14 days in advance. You are requesting % days in advance.', days_in_advance;
  END IF;
  
  -- Create the request
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
    target_user_auth_id,
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