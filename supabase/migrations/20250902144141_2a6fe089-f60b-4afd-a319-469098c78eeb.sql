-- Update the holiday admin overview function to match the specification
CREATE OR REPLACE FUNCTION public.get_holiday_admin_overview()
RETURNS TABLE(
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
SET search_path TO 'public'
AS $$
BEGIN
    -- Only allow admin access
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
        su.carried_over_days as carried_over,
        su.public_holidays as bank_holidays,
        su.christmas_closure_days as christmas_closure,
        su.sick_leave_days as sick_days,
        su.personal_days as personal_days,
        
        -- Step 1: Starting Allowance = AnnualLeaveDays + CarriedOverDays
        -- Step 2: BookableDays = AllowedDays - (BankHolidays + ChristmasClosureDays)
        (su.annual_leave_days + COALESCE(su.carried_over_days, 0) - su.public_holidays - su.christmas_closure_days) as available_for_booking,
        
        -- Count approved annual leave requests for current year
        COALESCE((
            SELECT SUM(hr.total_days)
            FROM holiday_requests hr
            WHERE hr.system_user_id = su.id
              AND hr.status = 'approved'
              AND hr.absence_type = 'annual_leave'
              AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0) as annual_booked,
        
        -- Step 3: RemainingDays = BookableDays - SUM(ApprovedHolidayRequests)
        (su.annual_leave_days + COALESCE(su.carried_over_days, 0) - su.public_holidays - su.christmas_closure_days - COALESCE((
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