-- Fix search_path for enforce_holiday_request_ownership function
CREATE OR REPLACE FUNCTION public.enforce_holiday_request_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;