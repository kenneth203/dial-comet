-- Fix security issues from previous migration

-- 1. Remove the security definer view and replace with a regular view
DROP VIEW IF EXISTS public.holiday_data_anomalies;
CREATE OR REPLACE VIEW public.holiday_data_anomalies AS
SELECT 
  hr.id as request_id,
  hr.user_id as request_user_id,
  hr.system_user_id,
  su.user_id as system_user_auth_id,
  su.name as system_user_name,
  hr.start_date,
  hr.end_date,
  hr.status,
  CASE 
    WHEN hr.user_id != su.user_id THEN 'USER_ID_MISMATCH'
    WHEN su.user_id IS NULL THEN 'MISSING_AUTH_USER_ID'
    ELSE 'OK'
  END as anomaly_type
FROM public.holiday_requests hr
LEFT JOIN public.system_users su ON hr.system_user_id = su.id
WHERE hr.user_id != su.user_id OR su.user_id IS NULL;

-- 2. Fix the trigger function to have proper search_path
CREATE OR REPLACE FUNCTION public.enforce_holiday_request_user_consistency()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;