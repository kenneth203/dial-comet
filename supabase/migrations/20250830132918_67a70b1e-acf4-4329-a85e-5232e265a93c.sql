-- Update the get_active_users_for_admin function to return all system users
-- using their system_users.id as the unique identifier instead of user_id
CREATE OR REPLACE FUNCTION public.get_active_users_for_admin()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  email text,
  role text,
  system_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if current user is admin or higher
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can view user list';
  END IF;
  
  -- Return active users from system_users table using system_users.id as unique identifier
  RETURN QUERY
  SELECT 
    su.id,
    su.user_id,
    su.name,
    su.email,
    su.role,
    su.id as system_user_id  -- Use system_users.id as the unique identifier
  FROM public.system_users su
  WHERE su.status = 'Active'
  ORDER BY su.name;
END;
$$;