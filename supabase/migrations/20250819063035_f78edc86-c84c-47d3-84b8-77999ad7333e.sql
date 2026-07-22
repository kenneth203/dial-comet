-- Enhanced security for holiday_requests table
-- Create additional validation functions to prevent data leakage

-- Function to securely get user's own holiday requests
CREATE OR REPLACE FUNCTION public.get_my_holiday_requests()
RETURNS TABLE(
  id uuid,
  start_date date,
  end_date date,
  total_days numeric,
  absence_type absence_type,
  status request_status,
  reason text,
  decline_reason text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  approved_by uuid,
  approved_at timestamp with time zone
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    hr.id,
    hr.start_date,
    hr.end_date,
    hr.total_days,
    hr.absence_type,
    hr.status,
    hr.reason,
    hr.decline_reason,
    hr.created_at,
    hr.updated_at,
    hr.approved_by,
    hr.approved_at
  FROM public.holiday_requests hr
  WHERE hr.user_id = auth.uid()
  ORDER BY hr.created_at DESC;
$$;

-- Function for admins to get all holiday requests with user names
CREATE OR REPLACE FUNCTION public.get_all_holiday_requests_admin()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  user_name text,
  start_date date,
  end_date date,
  total_days numeric,
  absence_type absence_type,
  status request_status,
  reason text,
  decline_reason text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  approved_by uuid,
  approved_at timestamp with time zone
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    hr.id,
    hr.user_id,
    p.name as user_name,
    hr.start_date,
    hr.end_date,
    hr.total_days,
    hr.absence_type,
    hr.status,
    hr.reason,
    hr.decline_reason,
    hr.created_at,
    hr.updated_at,
    hr.approved_by,
    hr.approved_at
  FROM public.holiday_requests hr
  LEFT JOIN public.profiles p ON p.user_id = hr.user_id
  WHERE is_admin_or_higher()
  ORDER BY hr.created_at DESC;
$$;

-- Function to safely create holiday requests with validation
CREATE OR REPLACE FUNCTION public.create_holiday_request(
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

-- Function to safely update holiday requests
CREATE OR REPLACE FUNCTION public.update_holiday_request(
  request_id uuid,
  new_start_date date DEFAULT NULL,
  new_end_date date DEFAULT NULL,
  new_absence_type absence_type DEFAULT NULL,
  new_reason text DEFAULT NULL
)
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

-- Enhanced RLS policies with stricter controls
-- Drop existing policies to recreate them with better security
DROP POLICY IF EXISTS "Users can view their own requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Users can create their own requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Users can update their own pending requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Admins and Supervisors can view all requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Admins and Supervisors can manage requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Users can delete their own pending or declined requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Admins can delete any holiday request" ON public.holiday_requests;

-- New ultra-secure policies
-- Users can only view via secure function
CREATE POLICY "Deny direct user access to holiday_requests"
ON public.holiday_requests
FOR SELECT
USING (false);

-- Only admins can directly access all records
CREATE POLICY "Admins can view all holiday requests"
ON public.holiday_requests
FOR SELECT
USING (is_admin_or_higher());

-- Users cannot insert directly (must use secure function)
CREATE POLICY "Deny direct insert to holiday_requests"
ON public.holiday_requests
FOR INSERT
WITH CHECK (false);

-- Only admins can insert directly
CREATE POLICY "Admins can insert holiday requests"
ON public.holiday_requests
FOR INSERT
WITH CHECK (is_admin_or_higher());

-- Users cannot update directly (must use secure function)
CREATE POLICY "Deny direct update to holiday_requests"
ON public.holiday_requests
FOR UPDATE
USING (false);

-- Only admins can update directly
CREATE POLICY "Admins can update holiday requests"
ON public.holiday_requests
FOR UPDATE
USING (is_admin_or_higher());

-- Users cannot delete directly
CREATE POLICY "Deny direct delete from holiday_requests"
ON public.holiday_requests
FOR DELETE
USING (false);

-- Only admins can delete
CREATE POLICY "Admins can delete holiday requests"
ON public.holiday_requests
FOR DELETE
USING (is_admin_or_higher());