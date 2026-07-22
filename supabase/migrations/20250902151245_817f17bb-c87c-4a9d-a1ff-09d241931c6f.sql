
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
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  RETURN QUERY
  SELECT
    /* Prefer the current user's own system_user row if present */
    (
      SELECT su.id
      FROM public.system_users su
      WHERE su.user_id = v_user_id AND su.status = 'Active'
      ORDER BY su.created_at DESC
      LIMIT 1
    ) AS system_user_id,
    v_user_id AS auth_user_id,
    /* Profile metadata */
    (SELECT cu.name  FROM public.comprehensive_users cu WHERE cu.auth_user_id = v_user_id LIMIT 1) AS name,
    (SELECT cu.email FROM public.comprehensive_users cu WHERE cu.auth_user_id = v_user_id LIMIT 1) AS email,
    (SELECT cu.role  FROM public.comprehensive_users cu WHERE cu.auth_user_id = v_user_id LIMIT 1) AS role,
    (SELECT cu.status FROM public.comprehensive_users cu WHERE cu.auth_user_id = v_user_id LIMIT 1) AS status,

    /* Entitlements (safe defaults if missing) */
    COALESCE(
      (SELECT he.annual_leave_days FROM public.holiday_entitlements he
       WHERE he.user_id = v_user_id AND he.year = v_year
       ORDER BY he.updated_at DESC LIMIT 1),
      25.0
    ) AS base_annual,
    COALESCE(
      (SELECT he.carried_over_days FROM public.holiday_entitlements he
       WHERE he.user_id = v_user_id AND he.year = v_year
       ORDER BY he.updated_at DESC LIMIT 1),
      0.0
    ) AS carried_over,

    /* Bank holidays / Christmas closure (use system_users if present, else fallback) */
    COALESCE(
      (SELECT su.public_holidays FROM public.system_users su
       WHERE su.user_id = v_user_id AND su.status = 'Active'
       ORDER BY su.created_at DESC LIMIT 1),
      10.0
    ) AS bank_holidays,
    COALESCE(
      (SELECT su.christmas_closure_days FROM public.system_users su
       WHERE su.user_id = v_user_id AND su.status = 'Active'
       ORDER BY su.created_at DESC LIMIT 1),
      5.0
    ) AS christmas_closure,

    /* Other leave types (safe defaults if missing) */
    COALESCE(
      (SELECT he.sick_leave_days FROM public.holiday_entitlements he
       WHERE he.user_id = v_user_id AND he.year = v_year
       ORDER BY he.updated_at DESC LIMIT 1),
      10.0
    ) AS sick_days,
    COALESCE(
      (SELECT he.personal_days FROM public.holiday_entitlements he
       WHERE he.user_id = v_user_id AND he.year = v_year
       ORDER BY he.updated_at DESC LIMIT 1),
      5.0
    ) AS personal_days,

    /* Available, booked, remaining (computed strictly for auth user) */
    (
      COALESCE(
        (SELECT he.annual_leave_days FROM public.holiday_entitlements he
         WHERE he.user_id = v_user_id AND he.year = v_year
         ORDER BY he.updated_at DESC LIMIT 1),
        25.0
      )
      +
      COALESCE(
        (SELECT he.carried_over_days FROM public.holiday_entitlements he
         WHERE he.user_id = v_user_id AND he.year = v_year
         ORDER BY he.updated_at DESC LIMIT 1),
        0.0
      )
    ) AS available_for_booking,

    COALESCE(
      (SELECT SUM(hr.total_days) FROM public.holiday_requests hr
       WHERE hr.user_id = v_user_id
         AND hr.status = 'approved'
         AND hr.absence_type = 'annual_leave'
         AND EXTRACT(YEAR FROM hr.start_date) = v_year),
      0
    ) AS annual_booked,

    (
      (
        COALESCE(
          (SELECT he.annual_leave_days FROM public.holiday_entitlements he
           WHERE he.user_id = v_user_id AND he.year = v_year
           ORDER BY he.updated_at DESC LIMIT 1),
          25.0
        )
        +
        COALESCE(
          (SELECT he.carried_over_days FROM public.holiday_entitlements he
           WHERE he.user_id = v_user_id AND he.year = v_year
           ORDER BY he.updated_at DESC LIMIT 1),
          0.0
        )
      )
      -
      COALESCE(
        (SELECT SUM(hr.total_days) FROM public.holiday_requests hr
         WHERE hr.user_id = v_user_id
           AND hr.status = 'approved'
           AND hr.absence_type = 'annual_leave'
           AND EXTRACT(YEAR FROM hr.start_date) = v_year),
        0
      )
    ) AS annual_remaining;
END;
$$;
