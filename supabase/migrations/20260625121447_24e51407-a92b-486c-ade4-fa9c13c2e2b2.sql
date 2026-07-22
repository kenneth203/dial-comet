CREATE OR REPLACE FUNCTION public.get_user_display_name(target_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(BTRIM(su.name), ''),
    CASE
      WHEN p.name IS NOT NULL AND p.name NOT ILIKE '%@%' AND BTRIM(p.name) <> ''
        THEN p.name
      ELSE NULL
    END,
    NULLIF(INITCAP(REPLACE(SPLIT_PART(COALESCE(su.email, p.name, ''), '@', 1), '.', ' ')), ''),
    'Unknown User'
  )
  FROM (SELECT target_user_id AS uid) x
  LEFT JOIN public.system_users su ON su.user_id = x.uid
  LEFT JOIN public.profiles p ON p.user_id = x.uid
  LIMIT 1;
$function$;