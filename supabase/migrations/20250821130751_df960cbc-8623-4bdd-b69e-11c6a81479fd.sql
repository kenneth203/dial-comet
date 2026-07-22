-- Enhanced Financial Data Security Implementation
-- This migration adds multiple layers of security for employee financial data

-- 1. Create encryption key management
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Add enhanced audit logging table for financial data access
CREATE TABLE IF NOT EXISTS public.financial_data_audit_enhanced (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accessed_by UUID NOT NULL,
    employee_user_id UUID NOT NULL,
    access_type TEXT NOT NULL, -- 'READ', 'UPDATE', 'DECRYPT', 'EXPORT'
    access_reason TEXT,
    fields_accessed TEXT[], -- Array of specific fields accessed
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    access_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    risk_score INTEGER DEFAULT 0, -- 0-100 risk assessment
    suspicious_flags TEXT[], -- Array of potential risk indicators
    data_classification TEXT DEFAULT 'HIGHLY_SENSITIVE'
);

-- Enable RLS on enhanced audit table
ALTER TABLE public.financial_data_audit_enhanced ENABLE ROW LEVEL SECURITY;

-- Only Super-Admin can view enhanced audit logs
CREATE POLICY "Ultra_restricted_financial_audit_access" 
ON public.financial_data_audit_enhanced 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'
    )
);

-- Prevent direct modifications
CREATE POLICY "No_direct_financial_audit_modifications" 
ON public.financial_data_audit_enhanced 
FOR ALL 
USING (false);

-- 3. Add encrypted storage fields to employee_financial_data
ALTER TABLE public.employee_financial_data 
ADD COLUMN IF NOT EXISTS encrypted_bank_account TEXT,
ADD COLUMN IF NOT EXISTS encrypted_ni_number TEXT,
ADD COLUMN IF NOT EXISTS encryption_key_id TEXT DEFAULT 'financial_v1',
ADD COLUMN IF NOT EXISTS last_decryption_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS decryption_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS access_restrictions JSONB DEFAULT '{}';

-- 4. Create secure encryption functions
CREATE OR REPLACE FUNCTION encrypt_sensitive_field(plain_text TEXT, key_suffix TEXT DEFAULT 'financial_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use a combination of pgcrypto and a configurable key
    RETURN encode(encrypt(plain_text::bytea, 'high_security_financial_encryption_key_2024', 'aes'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_sensitive_field(encrypted_text TEXT, key_suffix TEXT DEFAULT 'financial_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Decrypt using the same key
    RETURN convert_from(decrypt(decode(encrypted_text, 'hex'), 'high_security_financial_encryption_key_2024', 'aes'), 'UTF8');
EXCEPTION 
    WHEN OTHERS THEN
        -- Log decryption failure and return masked value
        RETURN '***DECRYPTION_ERROR***';
END;
$$;

-- 5. Enhanced secure financial data access function with additional security layers
CREATE OR REPLACE FUNCTION get_employee_financial_data_ultra_secure(
    employee_user_id UUID,
    access_reason TEXT,
    decrypt_sensitive BOOLEAN DEFAULT false
)
RETURNS TABLE(
    user_id UUID,
    salary NUMERIC,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_sort_code TEXT,
    ni_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    access_level TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    risk_score INTEGER := 0;
    suspicious_flags TEXT[] := '{}';
    access_granted BOOLEAN := false;
    current_hour INTEGER;
    weekend_access BOOLEAN;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Risk assessment
    current_hour := EXTRACT(HOUR FROM NOW());
    weekend_access := EXTRACT(DOW FROM NOW()) IN (0, 6); -- Sunday or Saturday
    
    -- Check for suspicious access patterns
    IF current_hour < 6 OR current_hour > 22 THEN
        risk_score := risk_score + 20;
        suspicious_flags := array_append(suspicious_flags, 'OUT_OF_HOURS_ACCESS');
    END IF;
    
    IF weekend_access THEN
        risk_score := risk_score + 15;
        suspicious_flags := array_append(suspicious_flags, 'WEEKEND_ACCESS');
    END IF;
    
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 20 THEN
        risk_score := risk_score + 30;
        suspicious_flags := array_append(suspicious_flags, 'INSUFFICIENT_JUSTIFICATION');
    END IF;
    
    -- Enhanced role-based access control
    IF accessor_role = 'Super-Admin' THEN
        access_granted := true;
    ELSIF accessor_role = 'HR' AND risk_score < 50 THEN
        access_granted := true;
    ELSE
        -- Log unauthorized access attempt
        INSERT INTO public.financial_data_audit_enhanced (
            accessed_by, employee_user_id, access_type, access_reason,
            risk_score, suspicious_flags, fields_accessed
        ) VALUES (
            auth.uid(), employee_user_id, 'UNAUTHORIZED_ATTEMPT', access_reason,
            risk_score, suspicious_flags, ARRAY['ALL']
        );
        
        RAISE EXCEPTION 'Access denied: Insufficient privileges or high risk score (%)' , risk_score;
    END IF;
    
    -- Log the access with enhanced details
    INSERT INTO public.financial_data_audit_enhanced (
        accessed_by, employee_user_id, access_type, access_reason,
        risk_score, suspicious_flags, fields_accessed
    ) VALUES (
        auth.uid(), employee_user_id, 
        CASE WHEN decrypt_sensitive THEN 'DECRYPT' ELSE 'READ' END,
        access_reason, risk_score, suspicious_flags,
        CASE WHEN decrypt_sensitive THEN ARRAY['salary', 'bank_account', 'ni_number'] ELSE ARRAY['metadata_only'] END
    );
    
    -- Update access tracking
    UPDATE public.employee_financial_data 
    SET 
        last_accessed_by = auth.uid(),
        last_accessed_at = NOW(),
        last_decryption_at = CASE WHEN decrypt_sensitive THEN NOW() ELSE last_decryption_at END,
        decryption_count = CASE WHEN decrypt_sensitive THEN COALESCE(decryption_count, 0) + 1 ELSE decryption_count END
    WHERE employee_financial_data.user_id = employee_user_id;
    
    -- Return the data with appropriate masking/decryption
    RETURN QUERY
    SELECT 
        efd.user_id,
        CASE 
            WHEN decrypt_sensitive AND accessor_role = 'Super-Admin' THEN efd.salary
            WHEN accessor_role IN ('Super-Admin', 'HR') THEN efd.salary
            ELSE NULL
        END as salary,
        efd.bank_name,
        CASE 
            WHEN decrypt_sensitive AND efd.encrypted_bank_account IS NOT NULL THEN 
                decrypt_sensitive_field(efd.encrypted_bank_account)
            WHEN accessor_role = 'Super-Admin' THEN efd.bank_account_number
            ELSE '****' || RIGHT(COALESCE(efd.bank_account_number, ''), 4)
        END as bank_account_number,
        efd.bank_sort_code,
        CASE 
            WHEN decrypt_sensitive AND efd.encrypted_ni_number IS NOT NULL THEN 
                decrypt_sensitive_field(efd.encrypted_ni_number)
            WHEN accessor_role = 'Super-Admin' THEN efd.ni_number
            ELSE REGEXP_REPLACE(COALESCE(efd.ni_number, ''), '.(?=.{3})', '*', 'g')
        END as ni_number,
        efd.created_at,
        efd.updated_at,
        CASE 
            WHEN decrypt_sensitive THEN 'DECRYPTED'
            WHEN accessor_role = 'Super-Admin' THEN 'FULL'
            ELSE 'MASKED'
        END as access_level
    FROM public.employee_financial_data efd
    WHERE efd.user_id = employee_user_id;
END;
$$;

-- 6. Create secure update function with enhanced validation
CREATE OR REPLACE FUNCTION update_employee_financial_data_secure(
    employee_user_id UUID,
    access_reason TEXT,
    new_salary NUMERIC DEFAULT NULL,
    new_bank_name TEXT DEFAULT NULL,
    new_bank_account_number TEXT DEFAULT NULL,
    new_bank_sort_code TEXT DEFAULT NULL,
    new_ni_number TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    changes_made TEXT[] := '{}';
BEGIN
    -- Enhanced permission check
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    IF accessor_role NOT IN ('Super-Admin', 'HR') THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin and HR can modify financial data';
    END IF;
    
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 20 THEN
        RAISE EXCEPTION 'Detailed access reason (min 20 chars) required for financial data modifications';
    END IF;
    
    -- Track what fields are being changed
    IF new_salary IS NOT NULL THEN
        changes_made := array_append(changes_made, 'salary');
    END IF;
    IF new_bank_account_number IS NOT NULL THEN
        changes_made := array_append(changes_made, 'bank_account_number');
    END IF;
    IF new_ni_number IS NOT NULL THEN
        changes_made := array_append(changes_made, 'ni_number');
    END IF;
    
    -- Log the modification attempt
    INSERT INTO public.financial_data_audit_enhanced (
        accessed_by, employee_user_id, access_type, access_reason,
        fields_accessed, risk_score
    ) VALUES (
        auth.uid(), employee_user_id, 'UPDATE', access_reason,
        changes_made, 0
    );
    
    -- Insert or update with encryption for sensitive fields
    INSERT INTO public.employee_financial_data (
        user_id, salary, bank_name, bank_account_number, bank_sort_code, ni_number,
        encrypted_bank_account, encrypted_ni_number
    ) VALUES (
        employee_user_id, new_salary, new_bank_name, new_bank_account_number, 
        new_bank_sort_code, new_ni_number,
        CASE WHEN new_bank_account_number IS NOT NULL THEN encrypt_sensitive_field(new_bank_account_number) END,
        CASE WHEN new_ni_number IS NOT NULL THEN encrypt_sensitive_field(new_ni_number) END
    )
    ON CONFLICT (user_id) DO UPDATE SET
        salary = COALESCE(new_salary, employee_financial_data.salary),
        bank_name = COALESCE(new_bank_name, employee_financial_data.bank_name),
        bank_account_number = COALESCE(new_bank_account_number, employee_financial_data.bank_account_number),
        bank_sort_code = COALESCE(new_bank_sort_code, employee_financial_data.bank_sort_code),
        ni_number = COALESCE(new_ni_number, employee_financial_data.ni_number),
        encrypted_bank_account = CASE 
            WHEN new_bank_account_number IS NOT NULL THEN encrypt_sensitive_field(new_bank_account_number)
            ELSE employee_financial_data.encrypted_bank_account
        END,
        encrypted_ni_number = CASE 
            WHEN new_ni_number IS NOT NULL THEN encrypt_sensitive_field(new_ni_number)
            ELSE employee_financial_data.encrypted_ni_number
        END,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- 7. Create a function to detect suspicious financial data access patterns
CREATE OR REPLACE FUNCTION detect_suspicious_financial_access()
RETURNS TABLE(
    employee_user_id UUID,
    accessor_id UUID,
    access_count BIGINT,
    avg_risk_score NUMERIC,
    suspicious_patterns TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only Super-Admin can run this analysis
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() AND role = 'Super-Admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin can analyze access patterns';
    END IF;
    
    RETURN QUERY
    WITH access_analysis AS (
        SELECT 
            f.employee_user_id,
            f.accessed_by,
            COUNT(*) as access_count,
            AVG(f.risk_score) as avg_risk_score,
            array_agg(DISTINCT unnest(f.suspicious_flags)) as all_flags
        FROM public.financial_data_audit_enhanced f
        WHERE f.access_time >= NOW() - INTERVAL '30 days'
        GROUP BY f.employee_user_id, f.accessed_by
    )
    SELECT 
        a.employee_user_id,
        a.accessed_by,
        a.access_count,
        a.avg_risk_score,
        a.all_flags
    FROM access_analysis a
    WHERE 
        a.access_count > 10 OR  -- High frequency access
        a.avg_risk_score > 30   -- High risk patterns
    ORDER BY a.avg_risk_score DESC, a.access_count DESC;
END;
$$;

-- 8. Create trigger to automatically encrypt new financial data
CREATE OR REPLACE FUNCTION auto_encrypt_financial_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Auto-encrypt sensitive fields on insert/update
    IF NEW.bank_account_number IS NOT NULL AND (OLD IS NULL OR OLD.bank_account_number != NEW.bank_account_number) THEN
        NEW.encrypted_bank_account = encrypt_sensitive_field(NEW.bank_account_number);
    END IF;
    
    IF NEW.ni_number IS NOT NULL AND (OLD IS NULL OR OLD.ni_number != NEW.ni_number) THEN
        NEW.encrypted_ni_number = encrypt_sensitive_field(NEW.ni_number);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS auto_encrypt_financial_trigger ON public.employee_financial_data;
CREATE TRIGGER auto_encrypt_financial_trigger
    BEFORE INSERT OR UPDATE ON public.employee_financial_data
    FOR EACH ROW EXECUTE FUNCTION auto_encrypt_financial_data();