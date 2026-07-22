CREATE OR REPLACE FUNCTION public.get_dm_candidates()
 RETURNS TABLE(id uuid, name text, role text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.user_id AS id,
    COALESCE(
      NULLIF(TRIM(su.name), ''),
      CASE
        WHEN p.name IS NOT NULL
         AND p.name <> ''
         AND POSITION('@' IN p.name) = 0
        THEN p.name
      END,
      INITCAP(REPLACE(SPLIT_PART(COALESCE(su.email, p.name, ''), '@', 1), '.', ' '))
    ) AS name,
    p.role::text,
    p.status::text
  FROM public.profiles p
  LEFT JOIN public.system_users su ON su.user_id = p.user_id
  WHERE p.user_id <> auth.uid()
    AND p.status = 'Active'
  ORDER BY 2;
$function$;