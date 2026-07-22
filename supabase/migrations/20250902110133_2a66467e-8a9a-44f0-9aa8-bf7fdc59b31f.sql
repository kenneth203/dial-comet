-- Drop the existing function first
DROP FUNCTION IF EXISTS public.create_holiday_request_secure(text, text, absence_type, text);

-- Create secure approval function that checks for conflicts
CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(
  request_id UUID,
  approver_id UUID DEFAULT auth.uid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record holiday_requests;
  overlapping_count INTEGER;
BEGIN
  -- Only admins can approve requests
  IF NOT is_admin_or_higher() THEN
    RETURN 'ERROR: Only administrators can approve holiday requests';
  END IF;

  -- Get the request details
  SELECT * INTO request_record
  FROM holiday_requests 
  WHERE id = request_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN 'ERROR: Request not found or already processed';
  END IF;

  -- Check for overlapping approved requests from other users
  SELECT COUNT(*) INTO overlapping_count
  FROM holiday_requests hr
  WHERE hr.user_id != request_record.user_id
    AND hr.status = 'approved'
    AND hr.start_date <= request_record.end_date
    AND hr.end_date >= request_record.start_date;

  IF overlapping_count > 0 THEN
    RETURN 'ERROR: Cannot approve - another person already has approved leave during this period';
  END IF;

  -- Approve the request
  UPDATE holiday_requests 
  SET 
    status = 'approved',
    approved_by = approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = request_id;

  RETURN 'SUCCESS: Holiday request approved';
END;
$$;

-- Create secure decline function
CREATE OR REPLACE FUNCTION public.decline_holiday_request_secure(
  request_id UUID,
  decline_reason TEXT,
  approver_id UUID DEFAULT auth.uid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can decline requests
  IF NOT is_admin_or_higher() THEN
    RETURN 'ERROR: Only administrators can decline holiday requests';
  END IF;

  -- Update the request
  UPDATE holiday_requests 
  SET 
    status = 'declined',
    decline_reason = decline_reason,
    approved_by = approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN 'ERROR: Request not found or already processed';
  END IF;

  RETURN 'SUCCESS: Holiday request declined';
END;
$$;

-- Recreate the create function to allow overlapping pending requests
CREATE OR REPLACE FUNCTION public.create_holiday_request_secure(
  req_start_date TEXT,
  req_end_date TEXT,
  req_absence_type absence_type,
  req_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date_parsed DATE;
  end_date_parsed DATE;
  working_days NUMERIC;
  new_request_id UUID;
BEGIN
  -- Parse dates
  BEGIN
    start_date_parsed := req_start_date::DATE;
    end_date_parsed := req_end_date::DATE;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'ERROR: Invalid date format. Please use YYYY-MM-DD format.';
  END;

  -- Basic validations
  IF start_date_parsed > end_date_parsed THEN
    RETURN 'ERROR: Start date cannot be after end date.';
  END IF;

  IF start_date_parsed < CURRENT_DATE THEN
    RETURN 'ERROR: Cannot request leave for past dates.';
  END IF;

  -- Calculate working days
  working_days := calculate_working_days(start_date_parsed, end_date_parsed);
  
  -- Check user doesn't already have overlapping requests (pending or approved)
  IF EXISTS (
    SELECT 1 FROM holiday_requests 
    WHERE user_id = auth.uid()
      AND status IN ('pending', 'approved')
      AND start_date <= end_date_parsed
      AND end_date >= start_date_parsed
  ) THEN
    RETURN 'ERROR: You already have a holiday request for overlapping dates.';
  END IF;

  -- Insert the request (allowing overlapping pending requests from different users)
  INSERT INTO holiday_requests (
    user_id, start_date, end_date, total_days, 
    absence_type, reason, status
  ) VALUES (
    auth.uid(), start_date_parsed, end_date_parsed, 
    working_days, req_absence_type, req_reason, 'pending'
  ) RETURNING id INTO new_request_id;

  RETURN 'SUCCESS: Holiday request submitted for approval. ID: ' || new_request_id;
END;
$$;

-- Update RLS policies to prevent direct status updates
DROP POLICY IF EXISTS "Users can update own pending requests" ON holiday_requests;

-- Create new policy that prevents status changes in direct updates
CREATE POLICY "Users can update own pending requests without status" 
ON holiday_requests 
FOR UPDATE 
USING (
  auth.uid() = user_id 
  AND status = 'pending' 
  AND start_date >= CURRENT_DATE
)
WITH CHECK (
  auth.uid() = user_id 
  AND status = 'pending'  -- Ensure status stays pending
  AND start_date >= CURRENT_DATE
);