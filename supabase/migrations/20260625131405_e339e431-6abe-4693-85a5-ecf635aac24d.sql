CREATE OR REPLACE FUNCTION public.get_system_user_holiday_breakdown()
RETURNS TABLE(base_entitlement numeric, bank_holidays numeric, christmas_closure numeric, personal_taken numeric, personal_remaining numeric, sick_leave_remaining numeric, personal_days_remaining numeric, annual_leave_days numeric, public_holidays numeric, christmas_closure_days numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_system_user_id uuid;
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  SELECT id INTO v_system_user_id FROM public.system_users WHERE user_id = auth.uid() LIMIT 1;

  RETURN QUERY
  WITH ent AS (
    SELECT he.*
    FROM public.holiday_entitlements he
    WHERE he.year = v_year
      AND (he.user_id = auth.uid() OR (v_system_user_id IS NOT NULL AND he.user_id = v_system_user_id))
    ORDER BY he.updated_at DESC NULLS LAST, he.created_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    COALESCE(e.annual_leave_entitlement, su.annual_leave_entitlement, 0)::numeric AS base_entitlement,
    COALESCE(e.public_holidays, 0)::numeric AS bank_holidays,
    COALESCE(e.christmas_closure_days, 0)::numeric AS christmas_closure,
    COALESCE(e.annual_leave_used, 0)::numeric AS personal_taken,
    (COALESCE(e.annual_leave_entitlement, su.annual_leave_entitlement, 0)
      - COALESCE(e.public_holidays, 0)
      - COALESCE(e.christmas_closure_days, 0)
      - COALESCE(e.annual_leave_used, 0))::numeric AS personal_remaining,
    (COALESCE(e.sick_leave_entitlement, 0) - COALESCE(e.sick_leave_used, 0))::numeric AS sick_leave_remaining,
    (COALESCE(e.personal_days_entitlement, 0) - COALESCE(e.personal_days_used, 0))::numeric AS personal_days_remaining,
    COALESCE(e.annual_leave_entitlement, su.annual_leave_entitlement, 0)::numeric AS annual_leave_days,
    COALESCE(e.public_holidays, 0)::numeric AS public_holidays,
    COALESCE(e.christmas_closure_days, 0)::numeric AS christmas_closure_days
  FROM public.system_users su
  LEFT JOIN ent e ON true
  WHERE su.user_id = auth.uid()
  LIMIT 1;
END;
$function$;