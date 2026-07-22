-- Fix holiday request approval/decline by making ownership trigger bypassable for admin operations

-- 1. Drop existing functions that need to be recreated
DROP FUNCTION IF EXISTS public.decline_holiday_request_secure(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.approve_holiday_request_secure(uuid, uuid);

-- 2. Update the enforce_holiday_request_ownership trigger to be bypassable
CREATE OR REPLACE FUNCTION public.enforce_holiday_request_ownership()
RETURNS TRIGGER AS $$
DECLARE
  bypass_check BOOLEAN := FALSE;
BEGIN
  -- Allow bypass for trusted admin operations
  BEGIN
    bypass_check := current_setting('app.bypass_ownership_check', true)::boolean;
  EXCEPTION WHEN OTHERS THEN
    bypass_check := FALSE;
  END;
  
  -- Skip ownership checks if bypass is enabled
  IF bypass_check THEN
    RETURN NEW;
  END IF;
  
  -- Original ownership validation logic
  IF NEW.user_id IS NOT NULL AND NEW.system_user_id IS NOT NULL THEN
    -- Verify the system_user_id belongs to the user_id
    IF NOT EXISTS (
      SELECT 1 FROM public.system_users su 
      WHERE su.id = NEW.system_user_id 
      AND su.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'system_user_id does not match the specified user_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create reconciling approve function that handles data mismatches
CREATE OR REPLACE FUNCTION public.approve_holiday_request_reconcile(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  -- Only admins/supervisors can approve
  IF NOT is_admin_or_higher() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only administrators can approve holiday requests');
  END IF;

  -- Enable bypass for this operation
  PERFORM set_config('app.bypass_ownership_check', 'true', true);

  -- Lock the row and get current state
  SELECT * INTO req
  FROM public.holiday_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found');
  END IF;

  IF req.status <> 'pending'::request_status THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only pending requests can be approved');
  END IF;

  -- Reconcile system_user_id if it's mismatched or missing
  IF req.system_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.system_users su 
    WHERE su.id = req.system_user_id 
    AND su.user_id = req.user_id
  ) THEN
    -- Try to find the correct system_user_id for this user_id
    UPDATE public.holiday_requests
    SET system_user_id = (
      SELECT su.id 
      FROM public.system_users su 
      WHERE su.user_id = req.user_id 
      LIMIT 1
    )
    WHERE id = p_request_id;
  END IF;

  -- Perform the approval
  UPDATE public.holiday_requests
  SET
    status = 'approved'::request_status,
    approved_by = auth.uid(),
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Reset bypass
  PERFORM set_config('app.bypass_ownership_check', 'false', true);

  RETURN jsonb_build_object('success', true, 'message', 'Holiday request approved successfully');
END;
$$;

-- 4. Create TEXT-returning wrapper for UI compatibility
CREATE FUNCTION public.approve_holiday_request_secure(
  request_id UUID,
  approver_id UUID DEFAULT auth.uid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Delegate to the reconciling function
  SELECT public.approve_holiday_request_reconcile(request_id) INTO result;
  
  IF (result->>'success')::boolean THEN
    RETURN 'SUCCESS: Holiday request approved';
  ELSE
    RETURN 'ERROR: ' || (result->>'message');
  END IF;
END;
$$;

-- 5. Create decline function with bypass capability
CREATE FUNCTION public.decline_holiday_request_secure(
  request_id UUID,
  p_decline_reason TEXT,
  approver_id UUID DEFAULT auth.uid()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  -- Only admins/supervisors can decline
  IF NOT is_admin_or_higher() THEN
    RETURN 'ERROR: Only administrators can decline holiday requests';
  END IF;

  -- Enable bypass for this operation
  PERFORM set_config('app.bypass_ownership_check', 'true', true);

  -- Lock the row and ensure it's pending
  SELECT * INTO req
  FROM public.holiday_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'ERROR: Request not found';
  END IF;

  IF req.status <> 'pending'::request_status THEN
    RETURN 'ERROR: Only pending requests can be declined';
  END IF;

  -- Reconcile system_user_id if needed
  IF req.system_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.system_users su 
    WHERE su.id = req.system_user_id 
    AND su.user_id = req.user_id
  ) THEN
    UPDATE public.holiday_requests
    SET system_user_id = (
      SELECT su.id 
      FROM public.system_users su 
      WHERE su.user_id = req.user_id 
      LIMIT 1
    )
    WHERE id = request_id;
  END IF;

  -- Update with decline
  UPDATE public.holiday_requests hr
  SET
    status = 'declined'::request_status,
    decline_reason = p_decline_reason,
    approved_by = approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE hr.id = request_id;

  -- Reset bypass
  PERFORM set_config('app.bypass_ownership_check', 'false', true);

  RETURN 'SUCCESS: Holiday request declined';
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.approve_holiday_request_reconcile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_holiday_request_reconcile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_holiday_request_secure(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_holiday_request_secure(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.decline_holiday_request_secure(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_holiday_request_secure(uuid, text, uuid) TO authenticated;