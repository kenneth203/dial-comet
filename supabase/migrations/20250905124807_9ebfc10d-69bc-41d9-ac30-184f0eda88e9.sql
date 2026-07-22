-- Update get_active_chat_users to include users from both system_users and profiles tables
CREATE OR REPLACE FUNCTION public.get_active_chat_users()
RETURNS TABLE(user_id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  -- First get users from system_users (preferred source)
  SELECT su.user_id, su.name
  FROM public.system_users su
  WHERE su.status = 'Active'
    AND su.user_id IS NOT NULL
    AND su.user_id <> auth.uid()
  
  UNION
  
  -- Then get users from profiles who don't have system_users records
  SELECT p.user_id, p.name
  FROM public.profiles p
  WHERE p.status = 'Active'
    AND p.user_id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.system_users su2 
      WHERE su2.user_id = p.user_id
    )
  
  ORDER BY name;
END;
$$;