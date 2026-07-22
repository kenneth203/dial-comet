-- Create function to get comprehensive holiday data for system users
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_data(system_user_id uuid)
RETURNS TABLE(
    user_id uuid,
    annual_leave_total numeric,
    annual_leave_taken numeric,
    annual_leave_remaining numeric,
    sick_leave_total numeric,
    sick_leave_taken numeric,
    sick_leave_remaining numeric,
    personal_days_total numeric,
    personal_days_taken numeric,
    personal_days_remaining numeric,
    public_holidays_total numeric,
    public_holidays_taken numeric,
    public_holidays_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_year integer := EXTRACT(YEAR FROM CURRENT_DATE);
    user_auth_id uuid;
BEGIN
    -- Get the auth user id from system_users table
    SELECT su.user_id INTO user_auth_id
    FROM public.system_users su
    WHERE su.id = system_user_id;
    
    IF user_auth_id IS NULL THEN
        -- Return default values if no user found
        RETURN QUERY SELECT 
            system_user_id,
            25.0::numeric, 0::numeric, 25.0::numeric, -- annual leave
            10.0::numeric, 0::numeric, 10.0::numeric, -- sick leave  
            5.0::numeric, 0::numeric, 5.0::numeric,   -- personal days
            8.0::numeric, 0::numeric, 8.0::numeric;   -- public holidays
        RETURN;
    END IF;

    RETURN QUERY
    WITH entitlements AS (
        SELECT 
            COALESCE(he.annual_leave_days, 25.0) as annual_total,
            COALESCE(he.sick_leave_days, 10.0) as sick_total,
            COALESCE(he.personal_days, 5.0) as personal_total,
            8.0 as public_holidays_total -- Standard UK bank holidays
        FROM public.holiday_entitlements he
        WHERE he.user_id = user_auth_id AND he.year = current_year
        
        UNION ALL
        
        -- If no entitlement record exists, use defaults
        SELECT 25.0, 10.0, 5.0, 8.0
        WHERE NOT EXISTS (
            SELECT 1 FROM public.holiday_entitlements 
            WHERE user_id = user_auth_id AND year = current_year
        )
        LIMIT 1
    ),
    used_days AS (
        SELECT 
            COALESCE(SUM(CASE 
                WHEN hr.absence_type = 'annual_leave' AND hr.status = 'approved' 
                THEN hr.total_days ELSE 0 
            END), 0) as annual_used,
            COALESCE(SUM(CASE 
                WHEN hr.absence_type = 'sick_leave' AND hr.status = 'approved' 
                THEN hr.total_days ELSE 0 
            END), 0) as sick_used,
            COALESCE(SUM(CASE 
                WHEN hr.absence_type IN ('compassionate_leave', 'study_leave') AND hr.status = 'approved' 
                THEN hr.total_days ELSE 0 
            END), 0) as personal_used,
            0 as public_holidays_used -- Typically not tracked as requests
        FROM public.holiday_requests hr
        WHERE hr.user_id = user_auth_id 
        AND EXTRACT(YEAR FROM hr.start_date) = current_year
    )
    SELECT 
        system_user_id,
        e.annual_total,
        u.annual_used,
        (e.annual_total - u.annual_used) as annual_remaining,
        e.sick_total,
        u.sick_used,
        (e.sick_total - u.sick_used) as sick_remaining,
        e.personal_total,
        u.personal_used,
        (e.personal_total - u.personal_used) as personal_remaining,
        e.public_holidays_total,
        u.public_holidays_used,
        (e.public_holidays_total - u.public_holidays_used) as public_holidays_remaining
    FROM entitlements e
    CROSS JOIN used_days u
    LIMIT 1;
END;
$$;