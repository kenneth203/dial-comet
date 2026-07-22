-- Create missing secure function for getting system user names
CREATE OR REPLACE FUNCTION public.get_system_user_name_secure(system_user_id uuid)
RETURNS TABLE(name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can access system user names
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only admins can access system user data';
  END IF;

  RETURN QUERY
  SELECT su.name 
  FROM public.system_users su 
  WHERE su.id = system_user_id;
END;
$$;