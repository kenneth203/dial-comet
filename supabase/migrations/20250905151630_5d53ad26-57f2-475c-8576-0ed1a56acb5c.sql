-- Fix the function to focus on System Users access, not HR
CREATE OR REPLACE FUNCTION public.get_all_system_users_minimal()
RETURNS TABLE(auth_user_id uuid, system_user_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    su.user_id      AS auth_user_id,
    su.id           AS system_user_id,
    su.name         AS name
  FROM public.system_users su
  WHERE su.status = 'Active'
    AND is_admin_or_higher() -- Only admin/supervisor access for user management
  ORDER BY su.name;
$function$;