
DROP FUNCTION IF EXISTS public.get_holiday_admin_overview(integer);

CREATE FUNCTION public.get_holiday_admin_overview(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS TABLE(user_id uuid, user_name text, user_role text, annual_leave_entitlement numeric, annual_leave_used numeric, sick_leave_entitlement numeric, sick_leave_used numeric, personal_days_entitlement numeric, personal_days_used numeric, carried_over numeric, pending_requests bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    su.id AS user_id,
    su.name AS user_name,
    su.role AS user_role,
    COALESCE(he.annual_leave_entitlement, 25) AS annual_leave_entitlement,
    COALESCE(he.annual_leave_used, 0) AS annual_leave_used,
    COALESCE(he.sick_leave_entitlement, 0) AS sick_leave_entitlement,
    COALESCE(he.sick_leave_used, 0) AS sick_leave_used,
    COALESCE(he.personal_days_entitlement, 0) AS personal_days_entitlement,
    COALESCE(he.personal_days_used, 0) AS personal_days_used,
    COALESCE(he.carried_over, 0) AS carried_over,
    (SELECT COUNT(*) FROM public.holiday_requests hr
     WHERE (hr.user_id = su.user_id OR hr.system_user_id = su.id) AND hr.status = 'pending') AS pending_requests
  FROM public.system_users su
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.holiday_entitlements he2
    WHERE he2.year = p_year
      AND (he2.user_id = su.user_id OR he2.user_id = su.id)
    ORDER BY he2.updated_at DESC NULLS LAST
    LIMIT 1
  ) he ON true
  WHERE su.status = 'Active'
  ORDER BY su.name;
$function$;
