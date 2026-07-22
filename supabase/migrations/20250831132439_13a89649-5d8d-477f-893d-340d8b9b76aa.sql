-- Create RPC function to get active staff with proper IDs for calendar display
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
    cu.auth_user_id,
    cu.id as system_user_id,
    cu.name
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active' 
    AND cu.is_staff_member = true
  ORDER BY cu.name;
$function$;