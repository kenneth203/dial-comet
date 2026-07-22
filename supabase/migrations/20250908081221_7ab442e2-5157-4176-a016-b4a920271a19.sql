-- Create secure RPC functions for system users management

-- Function to get all system users for management (Super-Admin/Admin/HR only)
CREATE OR REPLACE FUNCTION public.get_all_system_users_for_management()
RETURNS TABLE(
    id uuid,
    user_id uuid,
    name text,
    email text,
    role text,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    annual_leave_days numeric,
    sick_leave_days numeric,
    personal_days numeric,
    public_holidays numeric,
    carried_over_days numeric,
    start_date date,
    holiday_year integer,
    date_of_birth date,
    christmas_closure_days numeric,
    title text,
    current_address text,
    current_post_code text,
    permanent_address text,
    permanent_post_code text,
    home_phone text,
    mobile_phone text,
    national_insurance text,
    gender text,
    ethnicity text,
    nationality text,
    disability text,
    disability_category text,
    marital_status text,
    emergency_name text,
    emergency_relationship text,
    emergency_address text,
    emergency_phone text,
    bank_name text,
    bank_address text,
    account_number text,
    sort_code text,
    job_title text,
    department text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO user_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.status = 'Active';
    
    -- Only allow Super-Admin, Admin, and HR to access system users
    IF user_role NOT IN ('Super-Admin', 'Admin', 'HR') THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin, Admin, and HR can access system users management';
    END IF;
    
    -- Return all system users
    RETURN QUERY
    SELECT 
        su.id,
        su.user_id,
        su.name,
        su.email,
        su.role,
        su.status,
        su.created_at,
        su.updated_at,
        su.annual_leave_days,
        su.sick_leave_days,
        su.personal_days,
        su.public_holidays,
        su.carried_over_days,
        su.start_date,
        su.holiday_year,
        su.date_of_birth,
        su.christmas_closure_days,
        su.title,
        su.current_address,
        su.current_post_code,
        su.permanent_address,
        su.permanent_post_code,
        su.home_phone,
        su.mobile_phone,
        su.national_insurance,
        su.gender,
        su.ethnicity,
        su.nationality,
        su.disability,
        su.disability_category,
        su.marital_status,
        su.emergency_name,
        su.emergency_relationship,
        su.emergency_address,
        su.emergency_phone,
        su.bank_name,
        su.bank_address,
        su.account_number,
        su.sort_code,
        su.job_title,
        su.department
    FROM public.system_users su
    ORDER BY su.name;
END;
$$;

-- Function to create system user (Super-Admin/Admin/HR only)
CREATE OR REPLACE FUNCTION public.admin_create_system_user(
    p_user_id uuid,
    p_name text,
    p_email text,
    p_role text DEFAULT 'Operator',
    p_status text DEFAULT 'Active',
    p_annual_leave_days numeric DEFAULT 25.0,
    p_sick_leave_days numeric DEFAULT 10.0,
    p_personal_days numeric DEFAULT 5.0,
    p_public_holidays numeric DEFAULT 10.0,
    p_carried_over_days numeric DEFAULT 0.0,
    p_start_date date DEFAULT NULL,
    p_holiday_year integer DEFAULT EXTRACT(year FROM now())::integer,
    p_date_of_birth date DEFAULT NULL,
    p_christmas_closure_days numeric DEFAULT 5.0,
    p_title text DEFAULT NULL,
    p_current_address text DEFAULT NULL,
    p_current_post_code text DEFAULT NULL,
    p_permanent_address text DEFAULT NULL,
    p_permanent_post_code text DEFAULT NULL,
    p_home_phone text DEFAULT NULL,
    p_mobile_phone text DEFAULT NULL,
    p_national_insurance text DEFAULT NULL,
    p_gender text DEFAULT NULL,
    p_ethnicity text DEFAULT NULL,
    p_nationality text DEFAULT NULL,
    p_disability text DEFAULT NULL,
    p_disability_category text DEFAULT NULL,
    p_marital_status text DEFAULT NULL,
    p_emergency_name text DEFAULT NULL,
    p_emergency_relationship text DEFAULT NULL,
    p_emergency_address text DEFAULT NULL,
    p_emergency_phone text DEFAULT NULL,
    p_bank_name text DEFAULT NULL,
    p_bank_address text DEFAULT NULL,
    p_account_number text DEFAULT NULL,
    p_sort_code text DEFAULT NULL,
    p_job_title text DEFAULT NULL,
    p_department text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role TEXT;
    new_user_id uuid;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO user_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.status = 'Active';
    
    -- Only allow Super-Admin, Admin, and HR to create system users
    IF user_role NOT IN ('Super-Admin', 'Admin', 'HR') THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin, Admin, and HR can create system users';
    END IF;
    
    -- Insert the new system user
    INSERT INTO public.system_users (
        user_id, name, email, role, status, annual_leave_days, sick_leave_days,
        personal_days, public_holidays, carried_over_days, start_date, holiday_year,
        date_of_birth, christmas_closure_days, title, current_address, current_post_code,
        permanent_address, permanent_post_code, home_phone, mobile_phone, national_insurance,
        gender, ethnicity, nationality, disability, disability_category, marital_status,
        emergency_name, emergency_relationship, emergency_address, emergency_phone,
        bank_name, bank_address, account_number, sort_code, job_title, department
    ) VALUES (
        p_user_id, p_name, p_email, p_role, p_status, p_annual_leave_days, p_sick_leave_days,
        p_personal_days, p_public_holidays, p_carried_over_days, p_start_date, p_holiday_year,
        p_date_of_birth, p_christmas_closure_days, p_title, p_current_address, p_current_post_code,
        p_permanent_address, p_permanent_post_code, p_home_phone, p_mobile_phone, p_national_insurance,
        p_gender, p_ethnicity, p_nationality, p_disability, p_disability_category, p_marital_status,
        p_emergency_name, p_emergency_relationship, p_emergency_address, p_emergency_phone,
        p_bank_name, p_bank_address, p_account_number, p_sort_code, p_job_title, p_department
    )
    RETURNING id INTO new_user_id;
    
    RETURN new_user_id;
END;
$$;

-- Function to update system user (Super-Admin/Admin/HR only)
CREATE OR REPLACE FUNCTION public.admin_update_system_user(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_annual_leave_days numeric DEFAULT NULL,
    p_sick_leave_days numeric DEFAULT NULL,
    p_personal_days numeric DEFAULT NULL,
    p_public_holidays numeric DEFAULT NULL,
    p_carried_over_days numeric DEFAULT NULL,
    p_start_date date DEFAULT NULL,
    p_holiday_year integer DEFAULT NULL,
    p_date_of_birth date DEFAULT NULL,
    p_christmas_closure_days numeric DEFAULT NULL,
    p_title text DEFAULT NULL,
    p_current_address text DEFAULT NULL,
    p_current_post_code text DEFAULT NULL,
    p_permanent_address text DEFAULT NULL,
    p_permanent_post_code text DEFAULT NULL,
    p_home_phone text DEFAULT NULL,
    p_mobile_phone text DEFAULT NULL,
    p_national_insurance text DEFAULT NULL,
    p_gender text DEFAULT NULL,
    p_ethnicity text DEFAULT NULL,
    p_nationality text DEFAULT NULL,
    p_disability text DEFAULT NULL,
    p_disability_category text DEFAULT NULL,
    p_marital_status text DEFAULT NULL,
    p_emergency_name text DEFAULT NULL,
    p_emergency_relationship text DEFAULT NULL,
    p_emergency_address text DEFAULT NULL,
    p_emergency_phone text DEFAULT NULL,
    p_bank_name text DEFAULT NULL,
    p_bank_address text DEFAULT NULL,
    p_account_number text DEFAULT NULL,
    p_sort_code text DEFAULT NULL,
    p_job_title text DEFAULT NULL,
    p_department text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO user_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.status = 'Active';
    
    -- Only allow Super-Admin, Admin, and HR to update system users
    IF user_role NOT IN ('Super-Admin', 'Admin', 'HR') THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin, Admin, and HR can update system users';
    END IF;
    
    -- Update the system user
    UPDATE public.system_users 
    SET 
        name = COALESCE(p_name, name),
        email = COALESCE(p_email, email),
        role = COALESCE(p_role, role),
        status = COALESCE(p_status, status),
        annual_leave_days = COALESCE(p_annual_leave_days, annual_leave_days),
        sick_leave_days = COALESCE(p_sick_leave_days, sick_leave_days),
        personal_days = COALESCE(p_personal_days, personal_days),
        public_holidays = COALESCE(p_public_holidays, public_holidays),
        carried_over_days = COALESCE(p_carried_over_days, carried_over_days),
        start_date = COALESCE(p_start_date, start_date),
        holiday_year = COALESCE(p_holiday_year, holiday_year),
        date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
        christmas_closure_days = COALESCE(p_christmas_closure_days, christmas_closure_days),
        title = COALESCE(p_title, title),
        current_address = COALESCE(p_current_address, current_address),
        current_post_code = COALESCE(p_current_post_code, current_post_code),
        permanent_address = COALESCE(p_permanent_address, permanent_address),
        permanent_post_code = COALESCE(p_permanent_post_code, permanent_post_code),
        home_phone = COALESCE(p_home_phone, home_phone),
        mobile_phone = COALESCE(p_mobile_phone, mobile_phone),
        national_insurance = COALESCE(p_national_insurance, national_insurance),
        gender = COALESCE(p_gender, gender),
        ethnicity = COALESCE(p_ethnicity, ethnicity),
        nationality = COALESCE(p_nationality, nationality),
        disability = COALESCE(p_disability, disability),
        disability_category = COALESCE(p_disability_category, disability_category),
        marital_status = COALESCE(p_marital_status, marital_status),
        emergency_name = COALESCE(p_emergency_name, emergency_name),
        emergency_relationship = COALESCE(p_emergency_relationship, emergency_relationship),
        emergency_address = COALESCE(p_emergency_address, emergency_address),
        emergency_phone = COALESCE(p_emergency_phone, emergency_phone),
        bank_name = COALESCE(p_bank_name, bank_name),
        bank_address = COALESCE(p_bank_address, bank_address),
        account_number = COALESCE(p_account_number, account_number),
        sort_code = COALESCE(p_sort_code, sort_code),
        job_title = COALESCE(p_job_title, job_title),
        department = COALESCE(p_department, department),
        updated_at = now()
    WHERE id = p_id;
    
    RETURN FOUND;
END;
$$;

-- Function to delete system user (Super-Admin/Admin/HR only)
CREATE OR REPLACE FUNCTION public.admin_delete_system_user(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO user_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.status = 'Active';
    
    -- Only allow Super-Admin, Admin, and HR to delete system users
    IF user_role NOT IN ('Super-Admin', 'Admin', 'HR') THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin, Admin, and HR can delete system users';
    END IF;
    
    -- Delete the system user
    DELETE FROM public.system_users 
    WHERE id = p_id;
    
    RETURN FOUND;
END;
$$;