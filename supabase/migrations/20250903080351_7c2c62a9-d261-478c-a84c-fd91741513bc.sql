
-- 1) Fix ambiguous parameter/column in decline function
CREATE OR REPLACE FUNCTION public.decline_holiday_request_secure(
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

  -- Update with explicit parameter usage
  UPDATE public.holiday_requests hr
  SET
    status = 'declined'::request_status,
    decline_reason = p_decline_reason,
    approved_by = approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE hr.id = request_id;

  RETURN 'SUCCESS: Holiday request declined';
END;
$$;

REVOKE ALL ON FUNCTION public.decline_holiday_request_secure(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_holiday_request_secure(uuid, text, uuid) TO authenticated;

-- 2) Keep UI compatibility: wrap old TEXT-returning approve to call the new JSONB version
-- New JSONB function (approve_holiday_request_secure(p_request_id uuid)) already exists.
-- This wrapper delegates to it and preserves the TEXT return format expected by the UI.

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
  _ignored jsonb;
BEGIN
  -- Only admins/supervisors can approve
  IF NOT is_admin_or_higher() THEN
    RETURN 'ERROR: Only administrators can approve holiday requests';
  END IF;

  -- Delegate to the new reconciler function; capture any exception into a friendly text response
  BEGIN
    -- Explicitly target the (p_request_id uuid) overload
    SELECT public.approve_holiday_request_secure(p_request_id := request_id) INTO _ignored;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
  END;

  RETURN 'SUCCESS: Holiday request approved';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_holiday_request_secure(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_holiday_request_secure(uuid, uuid) TO authenticated;
