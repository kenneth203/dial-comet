-- Fix create_holiday_request_secure function to include system_user_id and return UUID
CREATE OR REPLACE FUNCTION public.create_holiday_request_secure(
  p_absence_type absence_type,
  p_start_date date,
  p_end_date date,
  p_reason text DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_user_id uuid;
  target_system_user_id uuid;
  calculated_days numeric;
  overlapping_count integer;
  new_request_id uuid;
BEGIN
  -- Determine target user (admin can create for others, users for themselves)
  IF p_target_user_id IS NOT NULL AND is_admin_or_higher() THEN
    target_user_id := p_target_user_id;
  ELSE
    target_user_id := auth.uid();
  END IF;
  
  -- Get the system_user_id for the target user
  SELECT id INTO target_system_user_id 
  FROM public.system_users 
  WHERE user_id = target_user_id 
  LIMIT 1;
  
  -- Validate dates
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Start date must be before or equal to end date';
  END IF;
  
  IF p_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot create holiday requests for past dates';
  END IF;
  
  -- Calculate working days
  calculated_days := calculate_working_days(p_start_date, p_end_date);
  
  -- Check for overlapping requests for the same user
  SELECT COUNT(*) INTO overlapping_count
  FROM public.holiday_requests
  WHERE user_id = target_user_id
    AND status IN ('pending', 'approved')
    AND (
      (p_start_date BETWEEN start_date AND end_date) OR
      (p_end_date BETWEEN start_date AND end_date) OR
      (start_date BETWEEN p_start_date AND p_end_date)
    );
  
  IF overlapping_count > 0 THEN
    RAISE EXCEPTION 'Overlapping holiday request already exists for this period';
  END IF;
  
  -- Insert the new holiday request with both user_id and system_user_id
  INSERT INTO public.holiday_requests (
    user_id,
    system_user_id,
    absence_type,
    start_date,
    end_date,
    total_days,
    reason,
    status
  ) VALUES (
    target_user_id,
    target_system_user_id,
    p_absence_type,
    p_start_date,
    p_end_date,
    calculated_days,
    p_reason,
    'pending'
  ) RETURNING id INTO new_request_id;
  
  RETURN new_request_id;
END;
$function$;

-- Backfill existing holiday_requests with missing system_user_id
UPDATE public.holiday_requests hr
SET system_user_id = su.id
FROM public.system_users su
WHERE hr.system_user_id IS NULL 
  AND su.user_id = hr.user_id;