-- Create function to automatically create holiday entitlement when a new profile is created
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
  );
  
  -- Create default staff details record
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
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically set up holiday data for new profiles
CREATE TRIGGER trigger_new_profile_holiday_setup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile();