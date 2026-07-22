-- Drop the conflicting functions that are causing overloading issues
DROP FUNCTION IF EXISTS public.get_system_user_holiday_data(text);
DROP FUNCTION IF EXISTS public.get_system_user_holiday_data(uuid);

-- Create a single, clear function with a unique signature
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_breakdown(target_user_id uuid)
RETURNS TABLE (
    user_id uuid,
    holiday_year integer,
    total_quota numeric,
    total_used numeric,
    total_remaining numeric,
    annual_leave_allowed numeric,
    annual_leave_used numeric,
    annual_leave_remaining numeric,
    sick_leave_allowed numeric,
    sick_leave_used numeric,
    sick_leave_remaining numeric,
    personal_days_allowed numeric,
    personal_days_used numeric,
    personal_days_remaining numeric,
    public_holidays_allowed numeric,
    public_holidays_used numeric,
    public_holidays_remaining numeric,
    carried_over_amount numeric,
    base_annual_leave_days numeric,
    base_sick_leave_days numeric,
    base_personal_days numeric,
    base_public_holidays numeric,
    christmas_closure_days numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    user_record system_users%ROWTYPE;
    current_year integer := EXTRACT(YEAR FROM NOW());
    annual_used numeric := 0;
    sick_used numeric := 0;
    personal_used numeric := 0;
BEGIN
    -- Get the latest system_users record for this user
    SELECT * INTO user_record 
    FROM system_users 
    WHERE system_users.user_id = target_user_id 
    ORDER BY updated_at DESC 
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Calculate used days from holiday_requests for current year
    SELECT 
        COALESCE(SUM(CASE WHEN absence_type = 'annual_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN absence_type = 'sick_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN absence_type IN ('compassionate_leave', 'study_leave') AND status = 'approved' THEN total_days ELSE 0 END), 0)
    INTO annual_used, sick_used, personal_used
    FROM holiday_requests 
    WHERE holiday_requests.user_id = target_user_id 
      AND EXTRACT(YEAR FROM start_date) = current_year;
    
    -- Return the computed holiday data
    RETURN QUERY SELECT
        user_record.user_id,
        user_record.holiday_year,
        -- Total quota is discretionary annual leave (after deducting mandatory holidays)
        GREATEST(0, user_record.annual_leave_days + user_record.carried_over_days - user_record.public_holidays - user_record.christmas_closure_days) AS total_quota,
        annual_used AS total_used,
        GREATEST(0, user_record.annual_leave_days + user_record.carried_over_days - user_record.public_holidays - user_record.christmas_closure_days - annual_used) AS total_remaining,
        -- Annual leave (full entitlement)
        user_record.annual_leave_days + user_record.carried_over_days AS annual_leave_allowed,
        annual_used AS annual_leave_used,
        GREATEST(0, user_record.annual_leave_days + user_record.carried_over_days - annual_used) AS annual_leave_remaining,
        -- Sick leave
        user_record.sick_leave_days AS sick_leave_allowed,
        sick_used AS sick_leave_used,
        GREATEST(0, user_record.sick_leave_days - sick_used) AS sick_leave_remaining,
        -- Personal days
        user_record.personal_days AS personal_days_allowed,
        personal_used AS personal_days_used,
        GREATEST(0, user_record.personal_days - personal_used) AS personal_days_remaining,
        -- Public holidays (mandatory)
        user_record.public_holidays AS public_holidays_allowed,
        0::numeric AS public_holidays_used,
        user_record.public_holidays AS public_holidays_remaining,
        -- Base values for reference
        user_record.carried_over_days AS carried_over_amount,
        user_record.annual_leave_days AS base_annual_leave_days,
        user_record.sick_leave_days AS base_sick_leave_days,
        user_record.personal_days AS base_personal_days,
        user_record.public_holidays AS base_public_holidays,
        user_record.christmas_closure_days;
END;
$$;