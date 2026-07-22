-- Create function to repair user mappings by matching email addresses
CREATE OR REPLACE FUNCTION public.repair_current_user_mapping()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_user_email TEXT;
    current_auth_uid UUID;
    correct_system_user_id UUID;
    incorrect_system_user_id UUID;
BEGIN
    -- Get current user's email and auth uid
    SELECT email INTO current_user_email FROM auth.users WHERE id = auth.uid();
    current_auth_uid := auth.uid();
    
    IF current_user_email IS NULL THEN
        RETURN; -- No authenticated user
    END IF;
    
    -- Find the system_users row that should belong to this user (by email)
    SELECT id INTO correct_system_user_id 
    FROM public.system_users 
    WHERE email = current_user_email 
    LIMIT 1;
    
    -- Find any system_users row that incorrectly has this user's auth uid
    SELECT id INTO incorrect_system_user_id 
    FROM public.system_users 
    WHERE user_id = current_auth_uid 
    AND email != current_user_email 
    LIMIT 1;
    
    -- If we found the correct row by email, update it to have the correct user_id
    IF correct_system_user_id IS NOT NULL THEN
        UPDATE public.system_users 
        SET user_id = current_auth_uid 
        WHERE id = correct_system_user_id;
    END IF;
    
    -- If we found an incorrect mapping, clear it
    IF incorrect_system_user_id IS NOT NULL THEN
        UPDATE public.system_users 
        SET user_id = NULL 
        WHERE id = incorrect_system_user_id;
    END IF;
END;
$$;

-- Update the get_my_holiday_overview function to repair mappings and use email matching
CREATE OR REPLACE FUNCTION public.get_my_holiday_overview()
RETURNS TABLE(
    user_id uuid,
    system_user_id uuid,
    name text,
    email text,
    role text,
    department text,
    annual_leave_allowed numeric,
    annual_leave_used numeric,
    annual_leave_remaining numeric,
    sick_leave_allowed numeric,
    sick_leave_used numeric,
    sick_leave_remaining numeric,
    personal_days_allowed numeric,
    personal_days_used numeric,
    personal_days_remaining numeric,
    public_holidays numeric,
    carried_over_days numeric,
    total_quota numeric,
    total_used numeric,
    total_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_user_email TEXT;
    current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
    -- First, repair any mapping issues
    PERFORM repair_current_user_mapping();
    
    -- Get current user's email from auth
    SELECT u.email INTO current_user_email 
    FROM auth.users u 
    WHERE u.id = auth.uid();
    
    -- Return holiday overview data, prioritizing email match over user_id match
    RETURN QUERY
    WITH user_data AS (
        SELECT 
            su.user_id,
            su.id as system_user_id,
            su.name,
            su.email,
            su.role,
            su.department,
            COALESCE(su.annual_leave_days, 25.0) as annual_allowed,
            COALESCE(su.sick_leave_days, 10.0) as sick_allowed,
            COALESCE(su.personal_days, 5.0) as personal_allowed,
            COALESCE(su.public_holidays, 10.0) as public_holidays,
            COALESCE(su.carried_over_days, 0.0) as carried_over
        FROM public.system_users su
        WHERE su.email = current_user_email  -- Match by email first
        OR su.user_id = auth.uid()           -- Fallback to user_id match
        ORDER BY (su.email = current_user_email) DESC  -- Prioritize email match
        LIMIT 1
    ),
    usage_data AS (
        SELECT 
            COALESCE(SUM(CASE WHEN hr.absence_type = 'annual_leave' AND hr.status = 'approved' THEN hr.total_days ELSE 0 END), 0) as annual_used,
            COALESCE(SUM(CASE WHEN hr.absence_type = 'sick_leave' AND hr.status = 'approved' THEN hr.total_days ELSE 0 END), 0) as sick_used,
            COALESCE(SUM(CASE WHEN hr.absence_type IN ('compassionate_leave', 'study_leave') AND hr.status = 'approved' THEN hr.total_days ELSE 0 END), 0) as personal_used
        FROM public.holiday_requests hr
        WHERE hr.user_id = auth.uid()
        AND EXTRACT(YEAR FROM hr.start_date) = current_year
    )
    SELECT 
        ud.user_id,
        ud.system_user_id,
        ud.name,
        ud.email,
        ud.role,
        ud.department,
        ud.annual_allowed as annual_leave_allowed,
        ug.annual_used as annual_leave_used,
        (ud.annual_allowed + ud.carried_over - ug.annual_used) as annual_leave_remaining,
        ud.sick_allowed as sick_leave_allowed,
        ug.sick_used as sick_leave_used,
        (ud.sick_allowed - ug.sick_used) as sick_leave_remaining,
        ud.personal_allowed as personal_days_allowed,
        ug.personal_used as personal_days_used,
        (ud.personal_allowed - ug.personal_used) as personal_days_remaining,
        ud.public_holidays,
        ud.carried_over as carried_over_days,
        (ud.annual_allowed + ud.sick_allowed + ud.personal_allowed + ud.carried_over) as total_quota,
        (ug.annual_used + ug.sick_used + ug.personal_used) as total_used,
        (ud.annual_allowed + ud.sick_allowed + ud.personal_allowed + ud.carried_over - ug.annual_used - ug.sick_used - ug.personal_used) as total_remaining
    FROM user_data ud
    CROSS JOIN usage_data ug;
END;
$$;