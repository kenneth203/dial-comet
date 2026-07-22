-- Fix the handle_new_profile function to check for NULL user_id
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only create holiday entitlements if we have a valid user_id
  IF NEW.user_id IS NOT NULL THEN
    -- Create default holiday entitlement for the current year
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
      25.0,  -- Default annual leave days
      10.0,  -- Default sick leave days
      5.0,   -- Default personal days
      0.0    -- No carried over days for new users
    )
    ON CONFLICT (user_id, year) DO NOTHING; -- Don't overwrite existing entitlements
    
    -- Create default staff details record only if user_id is not null
    INSERT INTO public.staff_details (
      user_id,
      contract_type,
      working_hours_per_week,
      country
    )
    VALUES (
      NEW.user_id,
      'full_time',
      37.5,
      'United Kingdom'
    )
    ON CONFLICT (user_id) DO NOTHING; -- Don't overwrite existing staff details
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix the sync_system_user_to_holiday_entitlements function to check for NULL user_id
CREATE OR REPLACE FUNCTION public.sync_system_user_to_holiday_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only sync if we have a valid user_id
  IF NEW.user_id IS NOT NULL THEN
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
  END IF;
  
  RETURN NEW;
END;
$$;