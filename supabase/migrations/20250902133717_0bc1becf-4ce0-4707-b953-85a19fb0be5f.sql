-- Fix security warnings by setting search_path for functions

-- Fix auto_set_system_user_id function
CREATE OR REPLACE FUNCTION public.auto_set_system_user_id()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      COALESCE(cu.email, 'unknown@example.com'),
      COALESCE(p.role::text, cu.role, 'Operator'),
      COALESCE(p.status::text, cu.status, 'Active'),
      25.0, 10.0, 5.0, 10.0, 5.0, 0.0
    FROM public.profiles p
    FULL OUTER JOIN public.comprehensive_users cu ON cu.auth_user_id = p.user_id
    WHERE p.user_id = NEW.user_id OR cu.auth_user_id = NEW.user_id
    LIMIT 1
    RETURNING id INTO NEW.system_user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix validate_holiday_request_consistency function
CREATE OR REPLACE FUNCTION public.validate_holiday_request_consistency()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;