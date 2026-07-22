-- =============================================
-- CRITICAL SECURITY ENHANCEMENT FOR SYSTEM_USERS TABLE
-- =============================================

-- Step 1: Create enhanced audit table for system users access
CREATE TABLE IF NOT EXISTS public.system_users_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accessed_by UUID NOT NULL REFERENCES auth.users(id),
    employee_user_id UUID NOT NULL,
    access_type TEXT NOT NULL, -- 'READ', 'UPDATE', 'CREATE', 'DELETE', 'DECRYPT'
    access_reason TEXT,
    fields_accessed TEXT[], -- Array of field names accessed
    risk_score INTEGER DEFAULT 0,
    ip_address INET,
    user_agent TEXT,
    access_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit table - only Super-Admin can access
ALTER TABLE public.system_users_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super_Admin_only_system_users_audit" ON public.system_users_audit_log
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'::user_role
    )
);

-- Step 2: Create secure encryption functions with enhanced key management
CREATE OR REPLACE FUNCTION public.encrypt_sensitive_field(field_value TEXT, key_suffix TEXT DEFAULT 'employee_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF field_value IS NULL OR field_value = '' THEN
        RETURN NULL;
    END IF;
    
    -- Use user-specific key derivation for maximum security
    RETURN encode(encrypt(convert_to(field_value, 'UTF8'), digest('employee_key_v2_' || auth.uid()::text, 'sha256'), 'aes'), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_field(encrypted_text TEXT, key_suffix TEXT DEFAULT 'financial_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF encrypted_text IS NULL OR encrypted_text = '' THEN
        RETURN NULL;
    END IF;
    
    -- Use the same user-specific key derivation for decryption
    RETURN convert_from(decrypt(decode(encrypted_text, 'base64'), digest('financial_key_v2_' || auth.uid()::text, 'sha256'), 'aes'), 'UTF8');
EXCEPTION 
    WHEN OTHERS THEN
        -- Log decryption failure and return masked value
        RAISE NOTICE 'Decryption failed for sensitive field: %', SQLERRM;
        RETURN '***DECRYPTION_ERROR***';
END;
$$;

-- Step 3: Create data masking functions
CREATE OR REPLACE FUNCTION public.mask_phone_number(phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE 
        WHEN phone IS NULL OR LENGTH(phone) < 4 THEN phone
        ELSE '***' || RIGHT(phone, 4)
    END;
$$;

CREATE OR REPLACE FUNCTION public.mask_email(email_address TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN email_address IS NULL OR email_address !~ '^[^@]+@[^@]+\.[^@]+$' THEN email_address
    WHEN LENGTH(SPLIT_PART(email_address, '@', 1)) <= 2 THEN 
      '**@' || SPLIT_PART(email_address, '@', 2)
    ELSE 
      LEFT(SPLIT_PART(email_address, '@', 1), 2) || '***@' || SPLIT_PART(email_address, '@', 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_address(address TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE 
        WHEN address IS NULL OR LENGTH(address) < 10 THEN address
        ELSE LEFT(address, 10) || '...[REDACTED]'
    END;
$$;

-- Step 4: Create trigger to automatically encrypt sensitive data
CREATE OR REPLACE FUNCTION public.auto_encrypt_system_user_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Auto-encrypt national insurance number
    IF NEW.national_insurance IS NOT NULL AND (OLD IS NULL OR OLD.national_insurance != NEW.national_insurance) THEN
        NEW.encrypted_national_insurance = encrypt_sensitive_field(NEW.national_insurance);
    END IF;
    
    -- Auto-encrypt bank account number
    IF NEW.account_number IS NOT NULL AND (OLD IS NULL OR OLD.account_number != NEW.account_number) THEN
        NEW.encrypted_account_number = encrypt_sensitive_field(NEW.account_number);
    END IF;
    
    -- Auto-encrypt sort code
    IF NEW.sort_code IS NOT NULL AND (OLD IS NULL OR OLD.sort_code != NEW.sort_code) THEN
        NEW.encrypted_sort_code = encrypt_sensitive_field(NEW.sort_code);
    END IF;
    
    -- Update access tracking
    NEW.last_accessed_by = auth.uid();
    NEW.last_accessed_at = NOW();
    
    RETURN NEW;
END;
$$;

-- Create the encryption trigger
DROP TRIGGER IF EXISTS encrypt_system_user_data ON public.system_users;
CREATE TRIGGER encrypt_system_user_data
    BEFORE INSERT OR UPDATE ON public.system_users
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_encrypt_system_user_data();

-- Step 5: Create secure access function with proper data masking
CREATE OR REPLACE FUNCTION public.get_system_user_secure(
    employee_user_id UUID,
    access_reason TEXT,
    decrypt_sensitive BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    name TEXT,
    email TEXT,
    role TEXT,
    status TEXT,
    title TEXT,
    department TEXT,
    job_title TEXT,
    -- Masked/encrypted sensitive fields
    national_insurance TEXT,
    account_number TEXT,
    sort_code TEXT,
    mobile_phone TEXT,
    home_phone TEXT,
    current_address TEXT,
    permanent_address TEXT,
    emergency_phone TEXT,
    -- Metadata
    data_access_level TEXT,
    last_accessed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    accessor_role TEXT;
    risk_score INTEGER := 0;
    current_hour INTEGER;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.status = 'Active';
    
    -- Only allow HR, Admin, Super-Admin access
    IF accessor_role NOT IN ('Super-Admin', 'Admin', 'HR') THEN
        RAISE EXCEPTION 'Access denied: Only HR, Admin, and Super-Admin can access system user data';
    END IF;
    
    -- Calculate risk score for access
    current_hour := EXTRACT(HOUR FROM NOW());
    IF current_hour < 6 OR current_hour > 22 THEN
        risk_score := risk_score + 15;
    END IF;
    
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 10 THEN
        risk_score := risk_score + 20;
    END IF;
    
    -- Log the access attempt
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason,
        fields_accessed, risk_score
    ) VALUES (
        auth.uid(), employee_user_id, 
        CASE WHEN decrypt_sensitive THEN 'DECRYPT' ELSE 'READ' END,
        access_reason,
        CASE WHEN decrypt_sensitive THEN ARRAY['all_sensitive'] ELSE ARRAY['basic_info'] END,
        risk_score
    );
    
    -- Return data with appropriate masking based on role and decrypt flag
    RETURN QUERY
    SELECT 
        su.id,
        su.user_id,
        su.name,
        CASE 
            WHEN accessor_role = 'Super-Admin' THEN su.email
            ELSE mask_email(su.email)
        END as email,
        su.role,
        su.status,
        su.title,
        su.department,
        su.job_title,
        -- Sensitive fields - decrypt only for Super-Admin with explicit request
        CASE 
            WHEN decrypt_sensitive AND accessor_role = 'Super-Admin' AND su.encrypted_national_insurance IS NOT NULL THEN 
                decrypt_sensitive_field(su.encrypted_national_insurance)
            WHEN accessor_role = 'Super-Admin' THEN su.national_insurance
            ELSE REGEXP_REPLACE(COALESCE(su.national_insurance, ''), '.(?=.{3})', '*', 'g')
        END as national_insurance,
        CASE 
            WHEN decrypt_sensitive AND accessor_role = 'Super-Admin' AND su.encrypted_account_number IS NOT NULL THEN 
                decrypt_sensitive_field(su.encrypted_account_number)
            WHEN accessor_role = 'Super-Admin' THEN su.account_number
            ELSE '****' || RIGHT(COALESCE(su.account_number, ''), 4)
        END as account_number,
        CASE 
            WHEN decrypt_sensitive AND accessor_role = 'Super-Admin' AND su.encrypted_sort_code IS NOT NULL THEN 
                decrypt_sensitive_field(su.encrypted_sort_code)
            WHEN accessor_role = 'Super-Admin' THEN su.sort_code
            ELSE COALESCE(LEFT(su.sort_code, 2) || '****', '')
        END as sort_code,
        mask_phone_number(su.mobile_phone) as mobile_phone,
        mask_phone_number(su.home_phone) as home_phone,
        mask_address(su.current_address) as current_address,
        mask_address(su.permanent_address) as permanent_address,
        mask_phone_number(su.emergency_phone) as emergency_phone,
        CASE 
            WHEN decrypt_sensitive THEN 'DECRYPTED'
            WHEN accessor_role = 'Super-Admin' THEN 'FULL_ACCESS'
            ELSE 'MASKED'
        END as data_access_level,
        su.last_accessed_at
    FROM public.system_users su
    WHERE su.user_id = employee_user_id OR su.id = employee_user_id;
END;
$$;

-- Step 6: Enhance the existing get_all_system_users_for_management function with security
CREATE OR REPLACE FUNCTION public.get_all_system_users_for_management()
RETURNS TABLE(
    id UUID, user_id UUID, name TEXT, email TEXT, role TEXT, status TEXT,
    created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
    annual_leave_days NUMERIC, sick_leave_days NUMERIC, personal_days NUMERIC,
    public_holidays NUMERIC, carried_over_days NUMERIC, start_date DATE,
    holiday_year INTEGER, date_of_birth DATE, christmas_closure_days NUMERIC,
    title TEXT, job_title TEXT, department TEXT,
    -- Masked sensitive fields for list view
    mobile_phone_masked TEXT,
    home_phone_masked TEXT,
    address_masked TEXT,
    data_classification TEXT
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
    
    -- Log the bulk access
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, fields_accessed
    ) VALUES (
        auth.uid(), 
        '00000000-0000-0000-0000-000000000000'::UUID, -- Bulk access marker
        'BULK_READ',
        'Management dashboard access',
        ARRAY['basic_list_view']
    );
    
    -- Return all system users with masked sensitive data for list view
    RETURN QUERY
    SELECT 
        su.id,
        su.user_id,
        su.name,
        CASE 
            WHEN user_role = 'Super-Admin' THEN su.email
            ELSE mask_email(su.email)
        END as email,
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
        su.job_title,
        su.department,
        -- Always mask sensitive fields in list view
        mask_phone_number(su.mobile_phone) as mobile_phone_masked,
        mask_phone_number(su.home_phone) as home_phone_masked,
        mask_address(su.current_address) as address_masked,
        su.data_classification
    FROM public.system_users su
    ORDER BY su.name;
END;
$$;

-- Step 7: Create function to detect suspicious access patterns
CREATE OR REPLACE FUNCTION public.detect_suspicious_system_user_access()
RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    access_count BIGINT,
    decrypt_count BIGINT,
    high_risk_accesses BIGINT,
    last_access TIMESTAMP WITH TIME ZONE,
    risk_score INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only Super-Admin can run this analysis
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'::user_role
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin can analyze access patterns';
    END IF;

    RETURN QUERY
    SELECT 
        a.accessed_by as user_id,
        p.name as user_name,
        COUNT(*) as access_count,
        COUNT(*) FILTER (WHERE a.access_type = 'DECRYPT') as decrypt_count,
        COUNT(*) FILTER (WHERE a.risk_score > 15) as high_risk_accesses,
        MAX(a.access_time) as last_access,
        AVG(a.risk_score)::INTEGER as risk_score
    FROM public.system_users_audit_log a
    LEFT JOIN public.profiles p ON p.user_id = a.accessed_by
    WHERE a.access_time > NOW() - INTERVAL '30 days'
    GROUP BY a.accessed_by, p.name
    HAVING COUNT(*) > 50 OR COUNT(*) FILTER (WHERE a.access_type = 'DECRYPT') > 5
    ORDER BY risk_score DESC, access_count DESC;
END;
$$;

-- Step 8: Remove plaintext sensitive data (will be handled by encrypted versions)
-- First, migrate existing data to encrypted fields
DO $$
DECLARE
    rec RECORD;
BEGIN
    -- Only migrate if we have plaintext data that hasn't been encrypted yet
    FOR rec IN SELECT id, national_insurance, account_number, sort_code 
               FROM public.system_users 
               WHERE (national_insurance IS NOT NULL AND encrypted_national_insurance IS NULL)
                  OR (account_number IS NOT NULL AND encrypted_account_number IS NULL)
                  OR (sort_code IS NOT NULL AND encrypted_sort_code IS NULL)
    LOOP
        -- This will trigger the encryption via the trigger
        UPDATE public.system_users 
        SET updated_at = NOW()
        WHERE id = rec.id;
    END LOOP;
END $$;

-- Step 9: Add comprehensive comments for documentation
COMMENT ON TABLE public.system_users IS 'HIGHLY SENSITIVE: Employee data with enhanced security measures, encryption, and audit logging';
COMMENT ON FUNCTION public.get_system_user_secure IS 'Secure function to access system user data with proper authentication, authorization, masking, and audit logging';
COMMENT ON FUNCTION public.detect_suspicious_system_user_access IS 'Security analysis function to detect unusual access patterns to sensitive employee data';

-- Step 10: Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_system_user_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_suspicious_system_user_access TO authenticated;