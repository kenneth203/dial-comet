-- Update the RPC function to fetch staff from system_users instead of comprehensive_users
CREATE OR REPLACE FUNCTION public.get_active_staff_minimal()
RETURNS TABLE(
  auth_user_id UUID,
  system_user_id UUID,
  name TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    su.user_id as auth_user_id,
    su.id as system_user_id,
    su.name
  FROM public.system_users su
  WHERE su.status = 'Active'
  ORDER BY su.name;
$function$;