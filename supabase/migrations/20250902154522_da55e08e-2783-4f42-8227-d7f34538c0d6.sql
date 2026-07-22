
CREATE OR REPLACE FUNCTION public.get_my_holiday_overview()
RETURNS TABLE (
  system_user_id uuid,
  auth_user_id uuid,
  name text,
  email text,
  role text,
  status text,
  base_annual numeric,
  carried_over numeric,
  bank_holidays numeric,
  christmas_closure numeric,
  sick_days numeric,
  personal_days numeric,
  available_for_booking numeric,
  annual_booked numeric,
  annual_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  RETURN QUERY
  WITH su AS (
    SELECT su.*
    FROM public.system_users su
    WHERE su.user_id = v_user_id AND su.status = 'Active'
    ORDER BY su.created_at DESC
    LIMIT 1
  ),
  cu AS (
    SELECT cu.name, cu.email, cu.role, cu.status
    FROM public.comprehensive_users cu
    WHERE cu.auth_user_id = v_user_id
    LIMIT 1
  ),
  he AS (
    SELECT he.*
    FROM public.holiday_entitlements he
    WHERE he.user_id = v_user_id AND he.year = v_year
    ORDER BY he.updated_at DESC
    LIMIT 1
  ),
  booked AS (
    SELECT COALESCE(SUM(hr.total_days), 0) AS booked_days
    FROM public.holiday_requests hr
    LEFT JOIN su ON TRUE
    WHERE (
            (su.id IS NOT NULL AND hr.system_user_id = su.id)
         OR (su.id IS NULL AND hr.user_id = v_user_id)
          )
      AND hr.status = 'approved'
      AND hr.absence_type = 'annual_leave'
      AND EXTRACT(YEAR FROM hr.start_date) = v_year
  )
  SELECT
    (SELECT su.id FROM su) AS system_user_id,
    v_user_id AS auth_user_id,
    (SELECT cu.name FROM cu) AS name,
    (SELECT cu.email FROM cu) AS email,
    (SELECT cu.role FROM cu) AS role,
    (SELECT cu.status FROM cu) AS status,

    COALESCE((SELECT su.annual_leave_days FROM su), (SELECT he.annual_leave_days FROM he), 25.0) AS base_annual,
    COALESCE((SELECT su.carried_over_days FROM su), (SELECT he.carried_over_days FROM he), 0.0) AS carried_over,
    COALESCE((SELECT su.public_holidays FROM su), 10.0) AS bank_holidays,
    COALESCE((SELECT su.christmas_closure_days FROM su), 5.0) AS christmas_closure,
    COALESCE((SELECT su.sick_leave_days FROM su), (SELECT he.sick_leave_days FROM he), 10.0) AS sick_days,
    COALESCE((SELECT su.personal_days FROM su), (SELECT he.personal_days FROM he), 5.0) AS personal_days,

    (
      COALESCE((SELECT su.annual_leave_days FROM su), (SELECT he.annual_leave_days FROM he), 25.0)
      + COALESCE((SELECT su.carried_over_days FROM su), (SELECT he.carried_over_days FROM he), 0.0)
      - COALESCE((SELECT su.public_holidays FROM su), 10.0)
      - COALESCE((SELECT su.christmas_closure_days FROM su), 5.0)
    ) AS available_for_booking,

    (SELECT booked_days FROM booked) AS annual_booked,

    (
      (
        COALESCE((SELECT su.annual_leave_days FROM su), (SELECT he.annual_leave_days FROM he), 25.0)
        + COALESCE((SELECT su.carried_over_days FROM su), (SELECT he.carried_over_days FROM he), 0.0)
        - COALESCE((SELECT su.public_holidays FROM su), 10.0)
        - COALESCE((SELECT su.christmas_closure_days FROM su), 5.0)
      )
      - (SELECT booked_days FROM booked)
    ) AS annual_remaining;
END;
$$;
