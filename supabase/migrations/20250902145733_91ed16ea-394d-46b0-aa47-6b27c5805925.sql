-- Fix the holiday entitlements triggers to bypass RLS restrictions
-- The triggers need to run as the function owner (with admin privileges) rather than the calling user

-- Update sync_holiday_entitlements_from_system_users to properly handle RLS
CREATE OR REPLACE FUNCTION public.sync_holiday_entitlements_from_system_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- This allows the function to run with creator's privileges
SET search_path TO 'public'
AS $$
DECLARE
  current_year integer := EXTRACT(year FROM now())::int;
BEGIN
  -- Only sync if we have a valid user_id
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Temporarily disable RLS for this operation since we're in an admin context
  PERFORM set_config('row_security', 'off', true);
  
  -- Update current year's entitlement row if it exists
  UPDATE public.holiday_entitlements
     SET annual_leave_days   = COALESCE(NEW.annual_leave_days, annual_leave_days),
         sick_leave_days     = COALESCE(NEW.sick_leave_days, sick_leave_days),
         personal_days       = COALESCE(NEW.personal_days, personal_days),
         carried_over_days   = COALESCE(NEW.carried_over_days, carried_over_days),
         updated_at          = now()
   WHERE user_id = NEW.user_id
     AND year    = current_year;

  -- If nothing was updated, insert a new current-year row
  IF NOT FOUND THEN
    INSERT INTO public.holiday_entitlements (
      user_id, year, annual_leave_days, sick_leave_days, personal_days, carried_over_days, created_at, updated_at
    )
    VALUES (
      NEW.user_id,
      current_year,
      COALESCE(NEW.annual_leave_days, 25),
      COALESCE(NEW.sick_leave_days, 10),
      COALESCE(NEW.personal_days, 5),
      COALESCE(NEW.carried_over_days, 0),
      now(),
      now()
    );
  END IF;

  -- Re-enable RLS
  PERFORM set_config('row_security', 'on', true);

  RETURN NEW;
END;
$$;

-- Update sync_system_user_to_holiday_entitlements to properly handle RLS
CREATE OR REPLACE FUNCTION public.sync_system_user_to_holiday_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- This allows the function to run with creator's privileges
SET search_path TO 'public'
AS $$
BEGIN
  -- Only sync if we have a valid user_id
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Temporarily disable RLS for this operation since we're in an admin context
  PERFORM set_config('row_security', 'off', true);
  
  -- When a system_user is updated, sync their holiday data to holiday_entitlements for current year
  INSERT INTO public.holiday_entitlements (
    user_id,
    year,
    annual_leave_days,
    sick_leave_days,
    personal_days,
    carried_over_days
  )
  VALUES (
    NEW.user_id,
    EXTRACT(YEAR FROM NOW())::integer,
    COALESCE(NEW.annual_leave_days, 25.0),
    COALESCE(NEW.sick_leave_days, 10.0),
    COALESCE(NEW.personal_days, 5.0),
    COALESCE(NEW.carried_over_days, 0.0)
  )
  ON CONFLICT (user_id, year) DO UPDATE SET
    annual_leave_days = COALESCE(NEW.annual_leave_days, 25.0),
    sick_leave_days = COALESCE(NEW.sick_leave_days, 10.0),
    personal_days = COALESCE(NEW.personal_days, 5.0),
    carried_over_days = COALESCE(NEW.carried_over_days, 0.0),
    updated_at = NOW();
  
  -- Re-enable RLS
  PERFORM set_config('row_security', 'on', true);
    
  RETURN NEW;
END;
$$;