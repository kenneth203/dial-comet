-- Create function to enforce correct holiday request ownership
CREATE OR REPLACE FUNCTION public.enforce_holiday_request_ownership()
RETURNS TRIGGER AS $$
BEGIN
  -- For admin users creating requests for others, ensure system_user_id matches the target user
  IF NEW.user_id IS NOT NULL AND NEW.system_user_id IS NOT NULL THEN
    -- Verify that the system_user_id belongs to the user_id
    IF NOT EXISTS (
      SELECT 1 FROM public.system_users 
      WHERE id = NEW.system_user_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Holiday request system_user_id does not match the specified user_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add trigger to enforce ownership
DROP TRIGGER IF EXISTS enforce_holiday_ownership_trigger ON public.holiday_requests;
CREATE TRIGGER enforce_holiday_ownership_trigger
  BEFORE INSERT OR UPDATE ON public.holiday_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_holiday_request_ownership();

-- Create function to reassign misassigned holiday requests (admin only)
CREATE OR REPLACE FUNCTION public.reassign_holiday_requests_admin(
  request_ids UUID[],
  target_user_id UUID,
  target_system_user_id UUID
)
RETURNS boolean AS $$
DECLARE
  admin_role TEXT;
BEGIN
  -- Check if current user is admin
  SELECT role::TEXT INTO admin_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  IF admin_role NOT IN ('Admin', 'Super-Admin', 'Supervisor') THEN
    RAISE EXCEPTION 'Access denied: Only admins can reassign holiday requests';
  END IF;
  
  -- Verify target system_user_id belongs to target_user_id
  IF NOT EXISTS (
    SELECT 1 FROM public.system_users 
    WHERE id = target_system_user_id AND user_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'Target system_user_id does not belong to target_user_id';
  END IF;
  
  -- Update the requests
  UPDATE public.holiday_requests 
  SET 
    user_id = target_user_id,
    system_user_id = target_system_user_id,
    updated_at = NOW()
  WHERE id = ANY(request_ids);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create strict function for "My Holiday Requests" that only shows current user's requests
CREATE OR REPLACE FUNCTION public.get_my_holiday_requests_strict()
RETURNS TABLE(
  id uuid, start_date date, end_date date, total_days numeric, 
  absence_type absence_type, status request_status, reason text, 
  decline_reason text, created_at timestamp with time zone, 
  updated_at timestamp with time zone, approved_by uuid, 
  approved_at timestamp with time zone, user_id uuid, system_user_id uuid
) AS $$
BEGIN
  -- Only return requests where user_id explicitly matches the authenticated user
  RETURN QUERY
  SELECT 
    hr.id, hr.start_date, hr.end_date, hr.total_days,
    hr.absence_type, hr.status, hr.reason, hr.decline_reason,
    hr.created_at, hr.updated_at, hr.approved_by, hr.approved_at,
    hr.user_id, hr.system_user_id
  FROM public.holiday_requests hr
  WHERE hr.user_id = auth.uid()
  ORDER BY hr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to get Kate Campbell's user details for reassignment
CREATE OR REPLACE FUNCTION public.get_user_details_for_reassignment(user_name TEXT)
RETURNS TABLE(auth_user_id uuid, system_user_id uuid) AS $$
BEGIN
  -- Only allow admin access
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;
  
  RETURN QUERY
  SELECT 
    su.user_id as auth_user_id,
    su.id as system_user_id
  FROM public.system_users su
  WHERE su.name ILIKE user_name
    AND su.user_id IS NOT NULL
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;