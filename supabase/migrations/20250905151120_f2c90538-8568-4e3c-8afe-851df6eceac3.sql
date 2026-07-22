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
    AND (
      -- Allow existing admin/supervisor gate
      is_admin_or_higher()
      -- Also allow HR (matches document share management roles)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.role = 'HR'::user_role
          AND p.status = 'Active'::user_status
      )
    )
  ORDER BY su.name;
$function$;