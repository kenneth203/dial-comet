-- Improve the cancel_holiday_request_secure function to handle both user_id and system_user_id scenarios
CREATE OR REPLACE FUNCTION public.cancel_holiday_request_secure(request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_request holiday_requests%ROWTYPE;
  current_user_id uuid;
  user_system_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  -- Get current user's system_user_id if they have one
  SELECT id INTO user_system_id 
  FROM public.system_users 
  WHERE user_id = current_user_id 
  LIMIT 1;
  
  -- Get current request with ownership validation
  SELECT * INTO current_request 
  FROM public.holiday_requests 
  WHERE id = request_id 
    AND (
      user_id = current_user_id 
      OR system_user_id = user_system_id
    );
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday request not found or access denied';
  END IF;
  
  -- Only allow cancellation of pending requests
  IF current_request.status != 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be cancelled. Current status: %', current_request.status;
  END IF;
  
  -- Prevent cancellation of past requests
  IF current_request.start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot cancel requests that have already started';
  END IF;
  
  -- Update the status to cancelled
  UPDATE public.holiday_requests 
  SET 
    status = 'cancelled'::request_status,
    updated_at = now()
  WHERE id = request_id 
    AND (
      user_id = current_user_id 
      OR system_user_id = user_system_id
    );
  
  -- Verify the update was successful
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to cancel request - ownership validation failed';
  END IF;
  
  RETURN TRUE;
END;
$function$;