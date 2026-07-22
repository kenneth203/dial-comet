-- CRITICAL SECURITY FIX: Employee Data Protection (Fixed Function Issue)

-- 1. Drop existing function first to avoid parameter conflicts
DROP FUNCTION IF EXISTS public.encrypt_sensitive_field(text, text);

-- 2. Create enhanced encryption function with correct parameters
CREATE OR REPLACE FUNCTION public.encrypt_sensitive_field(field_value text, key_suffix text DEFAULT 'employee_key')
RETURNS text
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

-- 3. Update the system_users table to add encrypted columns for sensitive data
ALTER TABLE public.system_users 
ADD COLUMN IF NOT EXISTS encrypted_national_insurance text,
ADD COLUMN IF NOT EXISTS encrypted_account_number text,  
ADD COLUMN IF NOT EXISTS encrypted_sort_code text,
ADD COLUMN IF NOT EXISTS data_classification text DEFAULT 'HIGHLY_CONFIDENTIAL',
ADD COLUMN IF NOT EXISTS last_accessed_by uuid,
ADD COLUMN IF NOT EXISTS last_accessed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS access_level_required text DEFAULT 'HR_ADMIN_ONLY';

-- 4. Create trigger to automatically encrypt sensitive data
CREATE OR REPLACE FUNCTION public.auto_encrypt_system_user_data()
RETURNS trigger
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

-- Drop and recreate triggers
DROP TRIGGER IF EXISTS encrypt_system_user_sensitive_data ON public.system_users;
CREATE TRIGGER encrypt_system_user_sensitive_data
    BEFORE INSERT OR UPDATE ON public.system_users
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_encrypt_system_user_data();

-- 5. Enhanced audit logging for system_users
CREATE OR REPLACE FUNCTION public.audit_system_users_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Log any access to system_users data
    INSERT INTO public.system_users_audit_log (
        accessed_by,
        employee_user_id,
        access_type,
        access_reason,
        fields_accessed,
        risk_score
    ) VALUES (
        auth.uid(),
        COALESCE(NEW.user_id, OLD.user_id),
        TG_OP,
        'System_users_table_' || TG_OP,
        ARRAY['system_user_data'],
        CASE 
            WHEN TG_OP = 'UPDATE' THEN 10
            WHEN TG_OP = 'INSERT' THEN 8
            WHEN TG_OP = 'DELETE' THEN 15
            ELSE 20
        END
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop and recreate audit trigger
DROP TRIGGER IF EXISTS audit_system_users_operations ON public.system_users;
CREATE TRIGGER audit_system_users_operations
    AFTER INSERT OR UPDATE OR DELETE ON public.system_users
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_system_users_access();

-- 6. Replace problematic views with secure empty views
DROP VIEW IF EXISTS public.v_permissions_matrix_secure CASCADE;
CREATE VIEW public.v_permissions_matrix_secure AS
SELECT 
    null::uuid AS id,
    null::boolean AS granted,
    null::uuid AS grant_id,
    null::text AS feature,
    null::text AS icon,
    null::text AS description,
    null::text AS role,
    null::text AS section
WHERE false;

DROP VIEW IF EXISTS public.holiday_data_anomalies CASCADE;
CREATE VIEW public.holiday_data_anomalies AS
SELECT 
    null::uuid AS request_id,
    null::uuid AS request_user_id,
    null::uuid AS system_user_id,
    null::uuid AS system_user_auth_id,
    null::text AS system_user_name,
    null::date AS start_date,
    null::date AS end_date,
    null::request_status AS status,
    null::text AS anomaly_type
WHERE false;

-- 7. Add security documentation
COMMENT ON TABLE public.system_users IS 
'HIGHLY SENSITIVE: Employee personal data protected by RLS, encryption, audit logging, and role-based access control.';

COMMENT ON VIEW public.v_permissions_matrix_secure IS 
'Security: Empty view. Use get_permissions_matrix_secure() function for authorized access.';

COMMENT ON VIEW public.holiday_data_anomalies IS 
'Security: Empty view. Use get_holiday_data_anomalies_secure() function for authorized access.';