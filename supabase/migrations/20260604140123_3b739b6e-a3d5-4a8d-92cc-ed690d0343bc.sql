CREATE OR REPLACE FUNCTION public.get_remaining_leave_days(user_uuid uuid)
RETURNS TABLE(annual_leave_remaining numeric, sick_leave_remaining numeric, personal_days_remaining numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() <> user_uuid AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(he.annual_leave_entitlement, 25) - COALESCE(he.annual_leave_used, 0),
    COALESCE(he.sick_leave_entitlement, 10) - COALESCE(he.sick_leave_used, 0),
    COALESCE(he.personal_days_entitlement, 5) - COALESCE(he.personal_days_used, 0)
  FROM public.holiday_entitlements he
  WHERE he.user_id = user_uuid AND he.year = v_year
  LIMIT 1;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_remaining_leave_days(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_remaining_leave_days(uuid) TO authenticated, service_role;