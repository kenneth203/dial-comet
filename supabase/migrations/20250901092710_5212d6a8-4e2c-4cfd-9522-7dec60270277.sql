-- Create RPC function to get all staff (including inactive) for admin calendar
CREATE OR REPLACE FUNCTION public.get_all_staff_minimal()
RETURNS TABLE(
  auth_user_id uuid,
  system_user_id uuid,
  name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    cu.auth_user_id,
    su.id as system_user_id,
    cu.name
  FROM public.comprehensive_users cu
  LEFT JOIN public.system_users su ON su.user_id = cu.auth_user_id
  WHERE cu.is_staff_member = true
  ORDER BY cu.name;
$$;