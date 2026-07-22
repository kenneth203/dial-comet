DROP FUNCTION IF EXISTS public.get_all_system_users_minimal();
CREATE OR REPLACE FUNCTION public.get_all_system_users_minimal()
RETURNS TABLE(id uuid, user_id uuid, name text, role text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT su.id, su.user_id, su.name, su.role, su.status
  FROM public.system_users su
  ORDER BY su.name;
$function$;