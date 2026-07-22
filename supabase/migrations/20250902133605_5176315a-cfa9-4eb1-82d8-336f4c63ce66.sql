-- Step 1: Create missing system_users records for users who have holiday_requests but no system_user record
INSERT INTO public.system_users (
  user_id, 
  name, 
  email, 
  role, 
  status,
  annual_leave_days,
  sick_leave_days,
  personal_days,
  public_holidays,
  christmas_closure_days,
  carried_over_days
)
SELECT DISTINCT 
  hr.user_id,
  COALESCE(p.name, 'Unknown User'),
  COALESCE(cu.email, p.email, 'unknown@example.com'),
  COALESCE(p.role::text, 'Operator'),
  COALESCE(p.status::text, 'Active'),
  25.0, -- Default annual leave
  10.0, -- Default sick leave  
  5.0,  -- Default personal days
  10.0, -- Default public holidays
  5.0,  -- Default christmas closure
  0.0   -- Default carried over
FROM public.holiday_requests hr
LEFT JOIN public.profiles p ON p.user_id = hr.user_id
LEFT JOIN public.comprehensive_users cu ON cu.auth_user_id = hr.user_id
WHERE hr.user_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM public.system_users su WHERE su.user_id = hr.user_id
  );

-- Step 2: Backfill system_user_id for all holiday_requests that are missing it
UPDATE public.holiday_requests 
SET system_user_id = su.id
FROM public.system_users su
WHERE holiday_requests.user_id = su.user_id 
  AND holiday_requests.system_user_id IS NULL;

-- Step 3: Create trigger to automatically set system_user_id when inserting holiday_requests
CREATE OR REPLACE FUNCTION public.auto_set_system_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If system_user_id is not provided, try to get it from user_id
  IF NEW.system_user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.system_user_id 
    FROM public.system_users 
    WHERE user_id = NEW.user_id 
    LIMIT 1;
  END IF;
  
  -- If still null and we have user_id, create system_user record
  IF NEW.system_user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.system_users (
      user_id, 
      name, 
      email, 
      role, 
      status,
      annual_leave_days,
      sick_leave_days, 
      personal_days,
      public_holidays,
      christmas_closure_days,
      carried_over_days
    )
    SELECT 
      NEW.user_id,
      COALESCE(p.name, cu.name, 'Unknown User'),
      COALESCE(cu.email, p.email, 'unknown@example.com'),
      COALESCE(p.role::text, 'Operator'),
      COALESCE(p.status::text, 'Active'),
      25.0, 10.0, 5.0, 10.0, 5.0, 0.0
    FROM public.profiles p
    FULL OUTER JOIN public.comprehensive_users cu ON cu.auth_user_id = p.user_id
    WHERE p.user_id = NEW.user_id OR cu.auth_user_id = NEW.user_id
    LIMIT 1
    RETURNING id INTO NEW.system_user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_auto_set_system_user_id ON public.holiday_requests;
CREATE TRIGGER trigger_auto_set_system_user_id
  BEFORE INSERT ON public.holiday_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_system_user_id();

-- Step 4: Update create_holiday_request_secure function to allow sick leave backdating
CREATE OR REPLACE FUNCTION public.create_holiday_request_secure(
  p_user_id uuid,
  p_absence_type absence_type,
  p_start_date date,
  p_end_date date,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id uuid;
  calculated_days numeric;
  current_user_role text;
BEGIN
  -- Get current user role
  SELECT role::text INTO current_user_role
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Validate dates - allow backdating for sick leave and admin users
  IF p_start_date < CURRENT_DATE AND 
     p_absence_type != 'sick_leave' AND 
     current_user_role NOT IN ('Admin', 'Super-Admin', 'Supervisor') THEN
    RAISE EXCEPTION 'Cannot create holiday request for past dates except sick leave';
  END IF;
  
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'End date cannot be before start date';
  END IF;
  
  -- Calculate working days
  calculated_days := calculate_working_days(p_start_date, p_end_date);
  
  -- Insert the request
  INSERT INTO public.holiday_requests (
    user_id,
    absence_type,
    start_date,
    end_date,  
    total_days,
    reason,
    status
  ) VALUES (
    p_user_id,
    p_absence_type,
    p_start_date,
    p_end_date,
    calculated_days,
    p_reason,
    'pending'
  ) RETURNING id INTO request_id;
  
  RETURN request_id;
END;
$$;

-- Step 5: Add validation trigger to prevent data inconsistency
CREATE OR REPLACE FUNCTION public.validate_holiday_request_consistency()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure user_id and system_user_id are consistent
  IF NEW.user_id IS NOT NULL AND NEW.system_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.system_users 
      WHERE id = NEW.system_user_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'system_user_id does not match user_id';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_holiday_request_consistency ON public.holiday_requests;
CREATE TRIGGER trigger_validate_holiday_request_consistency
  BEFORE INSERT OR UPDATE ON public.holiday_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_holiday_request_consistency();