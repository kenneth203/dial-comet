CREATE OR REPLACE FUNCTION public.get_assignable_comprehensive_users()
RETURNS TABLE(id uuid, name text, role text, status text, department text, job_position text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    su.id,
    su.name,
    su.role,
    su.status,
    su.department,
    su.job_title AS job_position
  FROM public.system_users su
  WHERE su.status = 'Active'
  ORDER BY su.name;
$$;