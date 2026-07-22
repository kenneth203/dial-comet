-- Create a new minimal function specifically for document upload dropdown
CREATE OR REPLACE FUNCTION public.list_system_users_minimal()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  SELECT 
    su.id,
    su.name
  FROM public.system_users su
  WHERE is_hr_or_admin() = true
    AND su.status = 'Active'
    AND su.name IS NOT NULL
    AND su.name != ''
  ORDER BY su.name;
$function$;

-- Grant execute permissions to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.list_system_users_minimal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_system_users_minimal() TO anon;

-- Also grant execute permissions to the existing function to ensure it works
GRANT EXECUTE ON FUNCTION public.get_all_system_users_for_management() TO authenticated; 
GRANT EXECUTE ON FUNCTION public.get_all_system_users_for_management() TO anon;