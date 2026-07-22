-- Create function to get all staff for chat (both with and without accounts)
CREATE OR REPLACE FUNCTION public.get_all_staff_for_chat()
RETURNS TABLE(
  user_id uuid,
  name text,
  email text,
  has_account boolean
)
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
  SELECT 
    su.user_id,
    su.name,
    su.email,
    (su.user_id IS NOT NULL) as has_account
  FROM public.system_users su
  WHERE su.status = 'Active'
    AND su.user_id <> auth.uid()  -- Exclude current user
  ORDER BY 
    (su.user_id IS NOT NULL) DESC,  -- Put users with accounts first
    su.name;
END;
$$;