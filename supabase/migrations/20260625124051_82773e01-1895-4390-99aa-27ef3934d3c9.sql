CREATE OR REPLACE FUNCTION public.get_my_holiday_overview(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS TABLE(entitlement_id uuid, annual_leave_entitlement numeric, annual_leave_used numeric, sick_leave_entitlement numeric, sick_leave_used numeric, personal_days_entitlement numeric, personal_days_used numeric, carried_over numeric, requests json)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_system_user_id uuid;
BEGIN
  SELECT su.id INTO v_system_user_id
  FROM public.system_users su
  WHERE su.user_id = auth.uid()
  LIMIT 1;

  RETURN QUERY
  WITH my_requests AS (
    SELECT COALESCE(json_agg(row_to_json(hr) ORDER BY hr.created_at DESC), '[]'::json) AS requests_json
    FROM public.holiday_requests hr
    WHERE (hr.user_id = auth.uid() OR (v_system_user_id IS NOT NULL AND hr.system_user_id = v_system_user_id))
      AND EXTRACT(YEAR FROM hr.start_date) = p_year
  ),
  -- Pull EVERY entitlement row matching either key, then pick the freshest/highest.
  ent_candidates AS (
    SELECT he.*,
           CASE WHEN he.user_id = v_system_user_id THEN 0 ELSE 1 END AS key_priority
    FROM public.holiday_entitlements he
    WHERE he.year = p_year
      AND (
        he.user_id = auth.uid()
        OR (v_system_user_id IS NOT NULL AND he.user_id = v_system_user_id)
      )
  ),
  entitlement_row AS (
    SELECT *
    FROM ent_candidates
    ORDER BY key_priority ASC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    er.id AS entitlement_id,
    COALESCE(er.annual_leave_entitlement, COALESCE(su.annual_leave_entitlement, 25)) AS annual_leave_entitlement,
    COALESCE(er.annual_leave_used, 0) AS annual_leave_used,
    COALESCE(er.sick_leave_entitlement, 10) AS sick_leave_entitlement,
    COALESCE(er.sick_leave_used, 0) AS sick_leave_used,
    COALESCE(er.personal_days_entitlement, 5) AS personal_days_entitlement,
    COALESCE(er.personal_days_used, 0) AS personal_days_used,
    COALESCE(er.carried_over, 0) AS carried_over,
    mr.requests_json AS requests
  FROM my_requests mr
  LEFT JOIN entitlement_row er ON true
  LEFT JOIN public.system_users su ON su.id = v_system_user_id;
END;
$function$;