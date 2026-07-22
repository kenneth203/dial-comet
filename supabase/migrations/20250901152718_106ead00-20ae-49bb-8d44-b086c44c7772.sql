-- Fix security issue by adding SECURITY DEFINER to the get_all_people_minimal function
DROP FUNCTION IF EXISTS public.get_all_people_minimal();

CREATE OR REPLACE FUNCTION public.get_all_people_minimal()
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
  WHERE cu.status = 'Active'
    AND is_admin_or_higher() -- Only allow admin access
  ORDER BY cu.name;
$$;