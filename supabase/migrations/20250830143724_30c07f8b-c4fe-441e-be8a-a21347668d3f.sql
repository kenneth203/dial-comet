-- Drop all versions of get_holiday_admin_overview function
DROP FUNCTION IF EXISTS get_holiday_admin_overview();
DROP FUNCTION IF EXISTS get_holiday_admin_overview(integer);

-- Create the definitive version that handles the duplicate user_id issue
CREATE OR REPLACE FUNCTION get_holiday_admin_overview()
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
BEGIN
    RETURN QUERY
    SELECT 
        su.id as system_user_id,
        su.user_id as auth_user_id,
        su.name,
        su.email,
        su.role,
        su.status,
        su.annual_leave_days as base_annual,
        su.carried_over_days as carried_over,
        su.public_holidays as bank_holidays,
        su.christmas_closure_days as christmas_closure,
        su.sick_leave_days as sick_days,
        su.personal_days as personal_days,
        (su.annual_leave_days + su.carried_over_days) as available_for_booking,
        -- Count holiday requests by system_user_id instead of user_id to avoid duplication
        COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE hr.system_user_id = su.id
              AND hr.status = 'approved'
              AND hr.absence_type = 'annual_leave'
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0) as annual_booked,
        -- Calculate remaining correctly  
        (su.annual_leave_days + su.carried_over_days - COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE hr.system_user_id = su.id
              AND hr.status = 'approved'
              AND hr.absence_type = 'annual_leave'
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0)) as annual_remaining
    FROM system_users su
    WHERE su.status = 'Active'
    ORDER BY su.name;
END;
$$;