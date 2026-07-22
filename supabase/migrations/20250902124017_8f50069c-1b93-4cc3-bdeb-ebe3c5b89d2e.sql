-- Add trigger to enforce holiday_request user consistency
-- This ensures system_user_id and user_id always match for data integrity

CREATE OR REPLACE FUNCTION public.enforce_holiday_request_user_consistency()
RETURNS TRIGGER AS $$
DECLARE
  correct_user_id UUID;
BEGIN
  -- Get the correct user_id from system_users
  SELECT user_id INTO correct_user_id 
  FROM public.system_users 
  WHERE id = NEW.system_user_id;
  
  -- If system_user_id is provided but user_id doesn't match, fix it
  IF NEW.system_user_id IS NOT NULL AND correct_user_id IS NOT NULL THEN
    NEW.user_id := correct_user_id;
  END IF;
  
  -- If system_user_id is not provided, try to find it from user_id
  IF NEW.system_user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.system_user_id 
    FROM public.system_users 
    WHERE user_id = NEW.user_id 
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Create trigger for INSERT and UPDATE operations
DROP TRIGGER IF EXISTS enforce_holiday_request_consistency ON public.holiday_requests;
CREATE TRIGGER enforce_holiday_request_consistency
  BEFORE INSERT OR UPDATE ON public.holiday_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_holiday_request_user_consistency();