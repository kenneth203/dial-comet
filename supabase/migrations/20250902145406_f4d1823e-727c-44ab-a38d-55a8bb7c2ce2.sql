-- Fix the sync_holiday_entitlements_from_system_users function to handle NULL user_id
CREATE OR REPLACE FUNCTION public.sync_holiday_entitlements_from_system_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_year integer := EXTRACT(year FROM now())::int;
BEGIN
  -- Only sync if we have a valid user_id
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
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

  -- Note: public_holidays and christmas_closure_days are not stored in holiday_entitlements.
  -- We still update updated_at when those change so that a realtime event is emitted and clients can refetch.

  RETURN NEW;
END;
$$;