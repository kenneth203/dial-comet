-- ===================================================================
-- COMPREHENSIVE SECURITY ENHANCEMENT FOR EMPLOYEE DATA
-- ===================================================================

-- 1. Create separate table for highly sensitive personal data
CREATE TABLE IF NOT EXISTS public.employee_sensitive_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    date_of_birth DATE,
    full_address TEXT, -- Combining address fields for better control
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Audit fields
    last_accessed_by UUID,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0
);

-- Enable RLS on sensitive data table
ALTER TABLE public.employee_sensitive_data ENABLE ROW LEVEL SECURITY;

-- 2. Create data access audit table
CREATE TABLE IF NOT EXISTS public.sensitive_data_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accessed_by UUID NOT NULL,
    employee_user_id UUID NOT NULL,
    data_type TEXT NOT NULL, -- 'personal_details', 'emergency_contacts', etc.
    access_reason TEXT, -- Required justification
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE public.sensitive_data_access_log ENABLE ROW LEVEL SECURITY;

-- 3. Create data masking functions
CREATE OR REPLACE FUNCTION public.mask_phone_number(phone TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE 
        WHEN phone IS NULL OR LENGTH(phone) < 4 THEN phone
        ELSE SUBSTRING(phone FROM 1 FOR 3) || '***' || RIGHT(phone, 2)
    END;
$$;

CREATE OR REPLACE FUNCTION public.mask_email(email TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE 
        WHEN email IS NULL OR POSITION('@' IN email) = 0 THEN email
        ELSE LEFT(email, 2) || '***@' || SPLIT_PART(email, '@', 2)
    END;
$$;

CREATE OR REPLACE FUNCTION public.mask_address(address TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE 
        WHEN address IS NULL OR LENGTH(address) < 10 THEN address
        ELSE LEFT(address, 10) || '...[REDACTED]'
    END;
$$;

-- 4. Create secure data access function with audit logging
CREATE OR REPLACE FUNCTION public.get_employee_sensitive_data_secure(
    target_user_id UUID,
    access_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID,
    date_of_birth DATE,
    full_address TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    can_access BOOLEAN := FALSE;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Determine access level based on role and context
    IF accessor_role IN ('Super-Admin', 'HR') THEN
        can_access := TRUE;
    ELSIF accessor_role = 'Admin' AND access_reason IS NOT NULL THEN
        can_access := TRUE;
    ELSIF auth.uid() = target_user_id THEN
        can_access := TRUE; -- Users can access their own data
    END IF;
    
    -- Deny access if no permission
    IF NOT can_access THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to access sensitive employee data';
    END IF;
    
    -- Log the access attempt
    INSERT INTO public.sensitive_data_access_log (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        ip_address
    ) VALUES (
        auth.uid(),
        target_user_id,
        'sensitive_personal_data',
        COALESCE(access_reason, 'Self-access'),
        NULL -- IP will be captured at application level
    );
    
    -- Update access tracking
    UPDATE public.employee_sensitive_data 
    SET 
        last_accessed_by = auth.uid(),
        last_accessed_at = NOW(),
        access_count = COALESCE(access_count, 0) + 1
    WHERE employee_sensitive_data.user_id = target_user_id;
    
    -- Return the sensitive data
    RETURN QUERY
    SELECT 
        esd.user_id,
        esd.date_of_birth,
        esd.full_address,
        esd.emergency_contact_name,
        esd.emergency_contact_phone,
        esd.emergency_contact_relationship,
        esd.created_at,
        esd.updated_at
    FROM public.employee_sensitive_data esd
    WHERE esd.user_id = target_user_id;
END;
$$;

-- 5. Create function to get basic employee data with conditional masking
CREATE OR REPLACE FUNCTION public.get_employee_basic_data_secure(target_user_id UUID DEFAULT NULL)
RETURNS TABLE(
    id UUID,
    auth_user_id UUID,
    name TEXT,
    email TEXT,
    phone_number TEXT,
    role TEXT,
    status TEXT,
    employee_id TEXT,
    department TEXT,
    job_position TEXT,
    contract_type TEXT,
    working_hours_per_week NUMERIC,
    start_date DATE,
    annual_leave_entitlement NUMERIC,
    city TEXT,
    country TEXT,
    is_system_user BOOLEAN,
    is_staff_member BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    is_admin_access BOOLEAN := FALSE;
    query_user_id UUID;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Determine if this is admin access
    IF accessor_role IN ('Super-Admin', 'HR', 'Admin') THEN
        is_admin_access := TRUE;
    END IF;
    
    -- Set target user (self if not specified)
    query_user_id := COALESCE(target_user_id, auth.uid());
    
    -- Return data with conditional masking
    RETURN QUERY
    SELECT 
        cu.id,
        cu.auth_user_id,
        cu.name,
        CASE 
            WHEN is_admin_access OR cu.auth_user_id = auth.uid() THEN cu.email
            ELSE mask_email(cu.email)
        END as email,
        CASE 
            WHEN is_admin_access OR cu.auth_user_id = auth.uid() THEN cu.phone_number
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
    WHERE 
        (is_admin_access AND (target_user_id IS NULL OR cu.auth_user_id = target_user_id))
        OR (NOT is_admin_access AND cu.auth_user_id = auth.uid());
END;
$$;

-- 6. Create RLS policies for sensitive data table
CREATE POLICY "Ultra_restricted_sensitive_personal_data"
ON public.employee_sensitive_data
FOR ALL
TO authenticated
USING (FALSE) -- Block direct access
WITH CHECK (FALSE); -- Block direct modifications

-- 7. Create RLS policies for audit log
CREATE POLICY "Super_Admin_only_audit_log_access"
ON public.sensitive_data_access_log
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'::user_role
    )
);

-- Block direct modifications to audit log
CREATE POLICY "No_direct_audit_log_modifications"
ON public.sensitive_data_access_log
FOR INSERT
TO authenticated
WITH CHECK (FALSE);

CREATE POLICY "No_direct_audit_log_updates"
ON public.sensitive_data_access_log
FOR UPDATE
TO authenticated
USING (FALSE);

CREATE POLICY "No_direct_audit_log_deletes"
ON public.sensitive_data_access_log
FOR DELETE
TO authenticated
USING (FALSE);

-- 8. Migrate existing sensitive data to new table
INSERT INTO public.employee_sensitive_data (
    user_id,
    date_of_birth,
    full_address,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relationship
)
SELECT 
    cu.auth_user_id,
    cu.date_of_birth,
    CONCAT_WS(', ', 
        NULLIF(cu.address_line1, ''),
        NULLIF(cu.address_line2, ''),
        NULLIF(cu.city, ''),
        NULLIF(cu.postal_code, ''),
        NULLIF(cu.country, '')
    ) as full_address,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship
FROM public.comprehensive_users cu
WHERE cu.auth_user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 9. Create updated triggers
CREATE OR REPLACE FUNCTION public.update_sensitive_data_timestamp()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_sensitive_data_updated_at
    BEFORE UPDATE ON public.employee_sensitive_data
    FOR EACH ROW
    EXECUTE FUNCTION public.update_sensitive_data_timestamp();

-- 10. Create function to validate sensitive data access requests
CREATE OR REPLACE FUNCTION public.request_sensitive_data_access(
    target_user_id UUID,
    access_reason TEXT,
    data_types TEXT[] DEFAULT ARRAY['basic']
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    result JSONB := '{}';
    basic_data RECORD;
    sensitive_data RECORD;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Validate access reason for sensitive data
    IF 'sensitive' = ANY(data_types) AND (access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 10) THEN
        RAISE EXCEPTION 'Access reason must be at least 10 characters for sensitive data access';
    END IF;
    
    -- Get basic data (with masking)
    IF 'basic' = ANY(data_types) THEN
        SELECT * INTO basic_data FROM public.get_employee_basic_data_secure(target_user_id) LIMIT 1;
        result := result || jsonb_build_object('basic_data', to_jsonb(basic_data));
    END IF;
    
    -- Get sensitive data (with audit logging)
    IF 'sensitive' = ANY(data_types) THEN
        SELECT * INTO sensitive_data FROM public.get_employee_sensitive_data_secure(target_user_id, access_reason) LIMIT 1;
        result := result || jsonb_build_object('sensitive_data', to_jsonb(sensitive_data));
    END IF;
    
    RETURN result;
END;
$$;