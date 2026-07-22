-- Create secure function to cancel holiday requests
CREATE OR REPLACE FUNCTION public.cancel_holiday_request_secure(request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_request holiday_requests%ROWTYPE;
BEGIN
  -- Get current request and verify ownership
  SELECT * INTO current_request 
  FROM public.holiday_requests 
  WHERE id = request_id AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday request not found or access denied';
  END IF;
  
  -- Only allow cancellation of pending requests
  IF current_request.status != 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be cancelled';
  END IF;
  
  -- Update the status to cancelled
  UPDATE public.holiday_requests 
  SET 
    status = 'cancelled'::request_status,
    updated_at = now()
  WHERE id = request_id AND user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;