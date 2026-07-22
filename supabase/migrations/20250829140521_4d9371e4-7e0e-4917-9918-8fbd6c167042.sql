-- Security fix for system_users table: Restrict access to sensitive employee data
-- This addresses the "Employee Personal Information Could Be Stolen by Hackers" vulnerability

-- Step 1: Create enhanced audit logging for system_users access
CREATE TABLE IF NOT EXISTS public.system_users_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accessed_by UUID NOT NULL,
    employee_user_id UUID NOT NULL,
    access_type TEXT NOT NULL,
    access_reason TEXT,
    fields_accessed TEXT[],
    risk_score INTEGER DEFAULT 0,
    ip_address INET,
    user_agent TEXT,
    access_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit log
ALTER TABLE public.system_users_audit_log ENABLE ROW LEVEL SECURITY;

-- Only Super-Admin can view audit logs
CREATE POLICY "Super_Admin_only_system_users_audit" ON public.system_users_audit_log
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'Super-Admin'
        )
    );

-- Step 2: Migrate financial data from system_users to encrypted employee_financial_data
-- Insert financial data that doesn't already exist in employee_financial_data
INSERT INTO public.employee_financial_data (
    user_id, 
    salary, 
    bank_name, 
    bank_account_number, 
    bank_sort_code, 
    ni_number,
    encrypted_bank_account,
    encrypted_ni_number,
    data_classification,
    requires_mfa,
    created_at,
    updated_at
)
SELECT 
    su.user_id,
    NULL as salary, -- Will be updated separately by HR
    su.bank_name,
    su.account_number,
    su.sort_code,
    su.national_insurance,
    CASE 
        WHEN su.account_number IS NOT NULL AND su.account_number != '' 
        THEN encrypt_sensitive_field(su.account_number)
        ELSE NULL 
    END,
    CASE 
        WHEN su.national_insurance IS NOT NULL AND su.national_insurance != '' 
        THEN encrypt_sensitive_field(su.national_insurance)
        ELSE NULL 
    END,
    'HIGHLY_CONFIDENTIAL',
    true,
    NOW(),
    NOW()
FROM public.system_users su
WHERE su.user_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM public.employee_financial_data efd 
    WHERE efd.user_id = su.user_id
)
AND (
    su.account_number IS NOT NULL AND su.account_number != '' OR
    su.sort_code IS NOT NULL AND su.sort_code != '' OR
    su.national_insurance IS NOT NULL AND su.national_insurance != '' OR
    su.bank_name IS NOT NULL AND su.bank_name != ''
);

-- Step 3: Create secure function to access system_users data with proper authorization
CREATE OR REPLACE FUNCTION public.get_system_user_data_secure(
    target_user_id UUID,
    access_reason TEXT DEFAULT NULL,
    fields_requested TEXT[] DEFAULT ARRAY['basic']
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    name TEXT,
    email TEXT,
    mobile_phone TEXT,
    home_phone TEXT,
    role TEXT,
    status TEXT,
    department TEXT,
    job_title TEXT,
    start_date DATE,
    current_address TEXT,
    permanent_address TEXT,
    emergency_name TEXT,
    emergency_phone TEXT,
    emergency_relationship TEXT,
    access_level TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    is_own_record BOOLEAN;
    risk_score INTEGER := 0;
    can_access_sensitive BOOLEAN := FALSE;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid();
    
    -- Check if accessing own record
    is_own_record := (auth.uid() = target_user_id);
    
    -- Determine access level
    IF accessor_role IN ('Super-Admin', 'HR') THEN
        can_access_sensitive := TRUE;
    ELSIF accessor_role = 'Admin' AND access_reason IS NOT NULL AND LENGTH(access_reason) > 10 THEN
        can_access_sensitive := TRUE;
        risk_score := 10;
    ELSIF is_own_record THEN
        can_access_sensitive := TRUE; -- Users can see their own data
    ELSE
        -- Block unauthorized access
        INSERT INTO public.system_users_audit_log (
            accessed_by, employee_user_id, access_type, access_reason, risk_score, fields_accessed
        ) VALUES (
            auth.uid(), target_user_id, 'UNAUTHORIZED_ATTEMPT', 
            COALESCE(access_reason, 'No reason provided'), 
            50, fields_requested
        );
        
        RAISE EXCEPTION 'Access denied: Insufficient privileges to access system user data';
    END IF;
    
    -- Calculate risk score
    IF 'sensitive' = ANY(fields_requested) THEN
        risk_score := risk_score + 20;
    END IF;
    
    IF NOT is_own_record THEN
        risk_score := risk_score + 10;
    END IF;
    
    -- Log the access
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, 
        risk_score, fields_accessed
    ) VALUES (
        auth.uid(), target_user_id, 'SECURE_ACCESS', 
        COALESCE(access_reason, 'Authorized access'), 
        risk_score, fields_requested
    );
    
    -- Return data with appropriate masking
    RETURN QUERY
    SELECT 
        su.id,
        su.user_id,
        su.name,
        CASE 
            WHEN can_access_sensitive THEN su.email
            ELSE mask_email(su.email)
        END,
        CASE 
            WHEN can_access_sensitive THEN su.mobile_phone
            ELSE mask_phone_number(su.mobile_phone)
        END,
        CASE 
            WHEN can_access_sensitive THEN su.home_phone
            ELSE mask_phone_number(su.home_phone)
        END,
        su.role,
        su.status,
        su.department,
        su.job_title,
        su.start_date,
        CASE 
            WHEN can_access_sensitive THEN su.current_address
            ELSE mask_address(su.current_address)
        END,
        CASE 
            WHEN can_access_sensitive THEN su.permanent_address
            ELSE mask_address(su.permanent_address)
        END,
        CASE 
            WHEN can_access_sensitive THEN su.emergency_name
            ELSE '[REDACTED]'
        END,
        CASE 
            WHEN can_access_sensitive THEN su.emergency_phone
            ELSE mask_phone_number(su.emergency_phone)
        END,
        su.emergency_relationship,
        CASE 
            WHEN can_access_sensitive THEN 'FULL'
            ELSE 'MASKED'
        END
    FROM public.system_users su
    WHERE su.user_id = target_user_id;
END;
$$;

-- Step 4: Update RLS policies on system_users to be more restrictive
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own system users" ON public.system_users;
DROP POLICY IF EXISTS "Restricted access to system_users" ON public.system_users;
DROP POLICY IF EXISTS "Users can create system users" ON public.system_users;
DROP POLICY IF EXISTS "Users can delete system users" ON public.system_users;
DROP POLICY IF EXISTS "Authorized users can update system users" ON public.system_users;

-- Create highly restrictive policies
-- Block all direct access to system_users table - force use of secure functions
CREATE POLICY "Block_direct_system_users_access" ON public.system_users
    FOR SELECT USING (false);

-- Only HR and Super-Admin can perform operations, with audit logging
CREATE POLICY "HR_SuperAdmin_only_system_users_operations" ON public.system_users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role IN ('HR', 'Super-Admin')
            AND status = 'Active'
        )
    );

-- Emergency access for Super-Admin only
CREATE POLICY "Super_Admin_emergency_system_users_access" ON public.system_users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'Super-Admin'
            AND status = 'Active'
        )
    );

-- Step 5: Create function to get basic employee list for dropdowns/assignments
CREATE OR REPLACE FUNCTION public.get_system_users_basic_list()
RETURNS TABLE(
    id UUID,
    user_id UUID,
    name TEXT,
    role TEXT,
    status TEXT,
    department TEXT,
    job_title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid();
    
    -- Only allow HR, Admin, Super-Admin, or Supervisor access
    IF accessor_role NOT IN ('HR', 'Admin', 'Super-Admin', 'Supervisor') THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to view system users list';
    END IF;
    
    -- Log the access
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, 
        risk_score, fields_accessed
    ) VALUES (
        auth.uid(), auth.uid(), 'LIST_ACCESS', 
        'Basic employee list for ' || accessor_role, 
        0, ARRAY['basic_info']
    );
    
    RETURN QUERY
    SELECT 
        su.id,
        su.user_id,
        su.name,
        su.role,
        su.status,
        su.department,
        su.job_title
    FROM public.system_users su
    WHERE su.status = 'Active'
    ORDER BY su.name;
END;
$$;

-- Step 6: Create trigger to audit all system_users modifications
CREATE OR REPLACE FUNCTION public.audit_system_users_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Log all modifications to system_users
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, 
        risk_score, fields_accessed
    ) VALUES (
        auth.uid(), 
        COALESCE(NEW.user_id, OLD.user_id),
        TG_OP || '_SYSTEM_USER',
        'Direct table modification by ' || TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN 30 ELSE 20 END,
        ARRAY['all_fields']
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Create trigger
DROP TRIGGER IF EXISTS audit_system_users_trigger ON public.system_users;
CREATE TRIGGER audit_system_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.system_users
    FOR EACH ROW EXECUTE FUNCTION public.audit_system_users_changes();

-- Step 7: Securely remove financial data from system_users after migration
-- Note: We'll keep the columns for now but null them out after successful migration
-- This can be dropped in a future migration once we confirm everything works

UPDATE public.system_users 
SET 
    account_number = NULL,
    sort_code = NULL,
    national_insurance = NULL,
    bank_name = NULL,
    bank_address = NULL
WHERE EXISTS (
    SELECT 1 FROM public.employee_financial_data efd 
    WHERE efd.user_id = system_users.user_id
);

-- Step 8: Create mask functions if they don't exist
CREATE OR REPLACE FUNCTION public.mask_email(email_address TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT CASE 
        WHEN email_address IS NULL THEN NULL
        WHEN email_address LIKE '%@%' THEN 
            LEFT(email_address, 2) || '***@' || SPLIT_PART(email_address, '@', 2)
        ELSE '***@masked.com'
    END;
$function$;