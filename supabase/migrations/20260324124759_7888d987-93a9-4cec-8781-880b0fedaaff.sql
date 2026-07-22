
DROP FUNCTION IF EXISTS public.get_holiday_admin_overview();

CREATE OR REPLACE FUNCTION public.get_holiday_admin_overview()
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
    annual_remaining numeric,
    sick_remaining numeric,
    personal_remaining numeric,
    personal_taken numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin_or_higher() THEN
        RAISE EXCEPTION 'Access denied: Only admins can view holiday overview';
    END IF;

    RETURN QUERY
    SELECT 
        su.id as system_user_id,
        su.user_id as auth_user_id,
        su.name,
        su.email,
        su.role,
        su.status,
        su.annual_leave_days as base_annual,
        COALESCE(su.carried_over_days, 0::numeric) as carried_over,
        su.public_holidays as bank_holidays,
        su.christmas_closure_days as christmas_closure,
        su.sick_leave_days as sick_days,
        su.personal_days as personal_days,
        
        (su.annual_leave_days + COALESCE(su.carried_over_days, 0) - su.public_holidays - su.christmas_closure_days) as available_for_booking,
        
        COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE (hr.system_user_id = su.id OR (su.user_id IS NOT NULL AND hr.user_id = su.user_id))
              AND hr.status = 'approved'
              AND hr.absence_type = 'annual_leave'
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0) as annual_booked,
        
        (su.annual_leave_days + COALESCE(su.carried_over_days, 0) - su.public_holidays - su.christmas_closure_days - COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE (hr.system_user_id = su.id OR (su.user_id IS NOT NULL AND hr.user_id = su.user_id))
              AND hr.status = 'approved'
              AND hr.absence_type = 'annual_leave'
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0)) as annual_remaining,
        
        (su.sick_leave_days - COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE (hr.system_user_id = su.id OR (su.user_id IS NOT NULL AND hr.user_id = su.user_id))
              AND hr.status = 'approved'
              AND hr.absence_type = 'sick_leave'
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0)) as sick_remaining,
        
        (su.personal_days - COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE (hr.system_user_id = su.id OR (su.user_id IS NOT NULL AND hr.user_id = su.user_id))
              AND hr.status = 'approved'
              AND hr.absence_type IN ('compassionate_leave', 'study_leave')
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0)) as personal_remaining,
        
        COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE (hr.system_user_id = su.id OR (su.user_id IS NOT NULL AND hr.user_id = su.user_id))
              AND hr.status = 'approved'
              AND hr.absence_type IN ('compassionate_leave', 'study_leave')
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0) as personal_taken
        
    FROM system_users su
    WHERE su.status = 'Active'
    ORDER BY su.name;
END;
$$;
