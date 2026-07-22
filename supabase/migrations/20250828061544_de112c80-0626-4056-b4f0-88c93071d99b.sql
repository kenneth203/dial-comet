-- Security Fix: Move sensitive employee data from comprehensive_users to employee_sensitive_data
-- This addresses the critical security finding about employee personal information exposure

-- First, migrate existing sensitive data from comprehensive_users to employee_sensitive_data
INSERT INTO public.employee_sensitive_data (
    user_id,
    date_of_birth,
    full_address,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relationship,
    created_at,
    updated_at
)
SELECT 
    auth_user_id,
    date_of_birth,
    CASE 
        WHEN address_line1 IS NOT NULL OR address_line2 IS NOT NULL OR city IS NOT NULL OR postal_code IS NOT NULL THEN
            CONCAT_WS(', ', 
                NULLIF(address_line1, ''),
                NULLIF(address_line2, ''), 
                NULLIF(city, ''),
                NULLIF(postal_code, ''),
                NULLIF(country, '')
            )
        ELSE NULL
    END as full_address,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relationship,
    created_at,
    updated_at
FROM public.comprehensive_users 
WHERE auth_user_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
    date_of_birth = EXCLUDED.date_of_birth,
    full_address = EXCLUDED.full_address,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
    updated_at = EXCLUDED.updated_at;

-- Remove sensitive fields from comprehensive_users table
ALTER TABLE public.comprehensive_users 
    DROP COLUMN IF EXISTS date_of_birth,
    DROP COLUMN IF EXISTS address_line1,
    DROP COLUMN IF EXISTS address_line2,
    DROP COLUMN IF EXISTS postal_code,
    DROP COLUMN IF EXISTS emergency_contact_name,
    DROP COLUMN IF EXISTS emergency_contact_phone,
    DROP COLUMN IF EXISTS emergency_contact_relationship;

-- Update RLS policies for comprehensive_users to be more restrictive for remaining data
DROP POLICY IF EXISTS "Users_can_view_own_record_only" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_Admin_secure_access_only" ON public.comprehensive_users;

-- Create more restrictive policies for basic employee data
CREATE POLICY "Users_can_view_own_basic_info_only" 
ON public.comprehensive_users 
FOR SELECT 
TO authenticated
USING (
    auth.uid() = auth_user_id 
    AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND status = 'Active'::user_status
    )
);

CREATE POLICY "HR_Admin_can_view_basic_employee_info" 
ON public.comprehensive_users 
FOR SELECT 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('HR'::user_role, 'Super-Admin'::user_role)
        AND status = 'Active'::user_status
    )
);

-- Create function to safely access basic employee information with audit logging
CREATE OR REPLACE FUNCTION public.get_employee_basic_info_secure(target_user_id uuid DEFAULT NULL)
RETURNS TABLE(
    id uuid,
    auth_user_id uuid,
    name text,
    email text,
    phone_number text,
    role text,
    status text,
    employee_id text,
    department text,
    job_position text,
    contract_type text,
    working_hours_per_week numeric,
    start_date date,
    annual_leave_entitlement numeric,
    city text,
    country text,
    is_system_user boolean,
    is_staff_member boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    query_user_id UUID;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid() AND status = 'Active';
    
    -- Set target user (self if not specified or not authorized)
    IF accessor_role IN ('HR', 'Super-Admin') AND target_user_id IS NOT NULL THEN
        query_user_id := target_user_id;
    ELSE
        query_user_id := auth.uid(); -- Force to own record
    END IF;
    
    -- Log access attempt for audit trail
    INSERT INTO public.sensitive_data_access_log (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason
    ) VALUES (
        auth.uid(),
        query_user_id,
        'basic_employee_info',
        CASE 
            WHEN query_user_id = auth.uid() THEN 'Self-access'
            ELSE 'HR/Admin access to employee basic info'
        END
    );
    
    -- Return filtered basic information
    RETURN QUERY
    SELECT 
        cu.id,
        cu.auth_user_id,
        cu.name,
        CASE 
            WHEN accessor_role IN ('HR', 'Super-Admin') OR cu.auth_user_id = auth.uid() THEN cu.email
            ELSE mask_email(cu.email)
        END as email,
        CASE 
            WHEN accessor_role IN ('HR', 'Super-Admin') OR cu.auth_user_id = auth.uid() THEN cu.phone_number
            ELSE mask_phone_number(cu.phone_number)
        END as phone_number,
        cu.role,
        cu.status,
        cu.employee_id,
        cu.department,
        cu.job_position,
        cu.contract_type,
        cu.working_hours_per_week,
        cu.start_date,
        cu.annual_leave_entitlement,
        cu.city,
        cu.country,
        cu.is_system_user,
        cu.is_staff_member,
        cu.created_at,
        cu.updated_at
    FROM public.comprehensive_users cu
    WHERE cu.auth_user_id = query_user_id;
END;
$$;

-- Create function for masking email addresses
CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE 
        WHEN email IS NULL OR email = '' THEN email
        WHEN position('@' in email) > 0 THEN
            LEFT(email, 1) || '***@' || split_part(email, '@', 2)
        ELSE '***'
    END;
$$;

-- Create function for masking phone numbers
CREATE OR REPLACE FUNCTION public.mask_phone_number(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE 
        WHEN phone IS NULL OR LENGTH(phone) < 4 THEN phone
        ELSE '***' || RIGHT(phone, 4)
    END;
$$;