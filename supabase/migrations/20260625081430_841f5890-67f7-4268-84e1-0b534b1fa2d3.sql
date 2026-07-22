DROP FUNCTION IF EXISTS public.get_assignable_comprehensive_users();

CREATE FUNCTION public.get_assignable_comprehensive_users()
RETURNS TABLE(id uuid, name text, role text, status text, department text, job_position text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT su.id, su.name, su.role::text, su.status::text,
         su.department, su.position AS job_position
  FROM public.system_users su
  WHERE COALESCE(su.status, 'Active') <> 'Inactive'
  ORDER BY su.name;
$function$;

GRANT EXECUTE ON FUNCTION public.get_assignable_comprehensive_users() TO authenticated;