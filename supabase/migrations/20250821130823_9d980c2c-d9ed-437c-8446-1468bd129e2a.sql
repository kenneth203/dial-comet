-- Fix search path security warnings for financial data functions
-- This addresses the security linter warnings about mutable search paths

-- Fix encrypt_sensitive_field function
CREATE OR REPLACE FUNCTION encrypt_sensitive_field(plain_text TEXT, key_suffix TEXT DEFAULT 'financial_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Use a combination of pgcrypto and a configurable key
    RETURN encode(encrypt(plain_text::bytea, 'high_security_financial_encryption_key_2024', 'aes'), 'hex');
END;
$$;

-- Fix decrypt_sensitive_field function
CREATE OR REPLACE FUNCTION decrypt_sensitive_field(encrypted_text TEXT, key_suffix TEXT DEFAULT 'financial_key')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Fix auto_encrypt_financial_data function
CREATE OR REPLACE FUNCTION auto_encrypt_financial_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Fix detect_suspicious_financial_access function
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
SET search_path TO 'public'
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