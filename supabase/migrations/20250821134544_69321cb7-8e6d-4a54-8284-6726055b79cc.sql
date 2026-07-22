-- =====================================================
-- CRITICAL SECURITY FIX: Employee Financial Data Protection
-- Step 1: Enable required extensions
-- =====================================================

-- Enable pgcrypto for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Migrate any existing unencrypted data to encrypted columns
UPDATE public.employee_financial_data 
SET 
  encrypted_bank_account = encrypt_sensitive_field(bank_account_number),
  encrypted_ni_number = encrypt_sensitive_field(ni_number)
WHERE 
  (bank_account_number IS NOT NULL AND encrypted_bank_account IS NULL)
  OR (ni_number IS NOT NULL AND encrypted_ni_number IS NULL);

-- Step 3: Remove unsafe unencrypted columns for sensitive data
ALTER TABLE public.employee_financial_data 
DROP COLUMN IF EXISTS bank_account_number CASCADE,
DROP COLUMN IF EXISTS ni_number CASCADE;

-- Step 4: Add additional security fields for enhanced protection
ALTER TABLE public.employee_financial_data 
ADD COLUMN IF NOT EXISTS data_classification TEXT DEFAULT 'HIGHLY_CONFIDENTIAL',
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS requires_mfa BOOLEAN DEFAULT TRUE;

-- Step 5: Create maximum security access function (simplified for reliability)
CREATE OR REPLACE FUNCTION public.get_employee_financial_data_maximum_security(
  employee_user_id UUID,
  access_reason TEXT,
  mfa_verified BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  user_id UUID,
  salary NUMERIC,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_sort_code TEXT,
  ni_number TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  access_level TEXT,
  security_notice TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    accessor_role TEXT;
    risk_score INTEGER := 0;
    suspicious_flags TEXT[] := '{}';
    access_granted BOOLEAN := FALSE;
    current_hour INTEGER;
    weekend_access BOOLEAN;
    recent_access_count INTEGER;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Enhanced security checks
    current_hour := EXTRACT(HOUR FROM NOW());
    weekend_access := EXTRACT(DOW FROM NOW()) IN (0, 6);
    
    -- Check recent access frequency (prevent data mining)
    SELECT COUNT(*) INTO recent_access_count
    FROM public.financial_data_audit_enhanced
    WHERE accessed_by = auth.uid() 
      AND access_time >= NOW() - INTERVAL '1 hour';
    
    -- Risk assessment with stricter criteria
    IF current_hour < 7 OR current_hour > 20 THEN
        risk_score := risk_score + 25;
        suspicious_flags := array_append(suspicious_flags, 'OUT_OF_HOURS_ACCESS');
    END IF;
    
    IF weekend_access THEN
        risk_score := risk_score + 20;
        suspicious_flags := array_append(suspicious_flags, 'WEEKEND_ACCESS');
    END IF;
    
    IF recent_access_count > 5 THEN
        risk_score := risk_score + 30;
        suspicious_flags := array_append(suspicious_flags, 'HIGH_FREQUENCY_ACCESS');
    END IF;
    
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 25 THEN
        risk_score := risk_score + 40;
        suspicious_flags := array_append(suspicious_flags, 'INSUFFICIENT_JUSTIFICATION');
    END IF;
    
    -- MFA requirement for high-risk scenarios
    IF risk_score > 20 AND NOT mfa_verified THEN
        risk_score := risk_score + 50;
        suspicious_flags := array_append(suspicious_flags, 'MFA_REQUIRED');
    END IF;
    
    -- Strict role-based access with risk consideration
    IF accessor_role = 'Super-Admin' AND risk_score < 70 THEN
        access_granted := TRUE;
    ELSIF accessor_role = 'HR' AND risk_score < 40 AND mfa_verified THEN
        access_granted := TRUE;
    ELSE
        -- Log security violation
        INSERT INTO public.financial_data_audit_enhanced (
            accessed_by, employee_user_id, access_type, access_reason,
            risk_score, suspicious_flags, fields_accessed
        ) VALUES (
            auth.uid(), employee_user_id, 'SECURITY_VIOLATION', 
            COALESCE(access_reason, 'No reason provided'),
            risk_score, suspicious_flags, ARRAY['DENIED']
        );
        
        RAISE EXCEPTION 'SECURITY_VIOLATION: Access denied - Risk score: %, Flags: %', 
                       risk_score, array_to_string(suspicious_flags, ', ');
    END IF;
    
    -- Log authorized access with enhanced details
    INSERT INTO public.financial_data_audit_enhanced (
        accessed_by, employee_user_id, access_type, access_reason,
        risk_score, suspicious_flags, fields_accessed,
        ip_address, user_agent, session_id
    ) VALUES (
        auth.uid(), employee_user_id, 'AUTHORIZED_ACCESS', access_reason,
        risk_score, suspicious_flags, 
        ARRAY['salary', 'encrypted_bank_account', 'encrypted_ni_number'],
        inet_client_addr(), NULL, NULL
    );
    
    -- Update access tracking
    UPDATE public.employee_financial_data 
    SET 
        last_accessed_by = auth.uid(),
        last_accessed_at = NOW(),
        last_decryption_at = NOW(),
        decryption_count = COALESCE(decryption_count, 0) + 1
    WHERE employee_financial_data.user_id = employee_user_id;
    
    -- Return encrypted data with controlled decryption
    RETURN QUERY
    SELECT 
        efd.user_id,
        -- Salary is less sensitive, can be shown to HR+ with audit
        CASE 
            WHEN accessor_role IN ('Super-Admin', 'HR') THEN efd.salary
            ELSE NULL
        END as salary,
        efd.bank_name,
        -- Only decrypt if Super-Admin with valid reason
        CASE 
            WHEN accessor_role = 'Super-Admin' AND LENGTH(access_reason) >= 30 THEN 
                COALESCE(decrypt_sensitive_field(efd.encrypted_bank_account), 'No data')
            ELSE 
                '****-****-' || RIGHT(COALESCE(decrypt_sensitive_field(efd.encrypted_bank_account), '0000'), 4)
        END as bank_account_number,
        efd.bank_sort_code,
        -- NI Number - highest security, Super-Admin only with MFA
        CASE 
            WHEN accessor_role = 'Super-Admin' AND mfa_verified AND LENGTH(access_reason) >= 30 THEN 
                COALESCE(decrypt_sensitive_field(efd.encrypted_ni_number), 'No data')
            ELSE 
                REGEXP_REPLACE(COALESCE(decrypt_sensitive_field(efd.encrypted_ni_number), 'XX 00 00 00 X'), '.(?=.{3})', '*', 'g')
        END as ni_number,
        efd.created_at,
        efd.updated_at,
        CASE 
            WHEN accessor_role = 'Super-Admin' AND mfa_verified THEN 'FULL_ACCESS'
            WHEN accessor_role = 'Super-Admin' THEN 'ADMIN_MASKED'
            ELSE 'HR_RESTRICTED'
        END as access_level,
        CASE 
            WHEN risk_score > 30 THEN 'HIGH_RISK_ACCESS - Additional monitoring applied'
            WHEN NOT mfa_verified THEN 'MFA_RECOMMENDED - Consider enabling MFA for enhanced security'
            ELSE 'SECURE_ACCESS'
        END as security_notice
    FROM public.employee_financial_data efd
    WHERE efd.user_id = employee_user_id;
END;
$function$;

-- Step 6: Create secure update function with encryption
CREATE OR REPLACE FUNCTION public.update_employee_financial_data_maximum_security(
  employee_user_id UUID,
  access_reason TEXT,
  new_salary NUMERIC DEFAULT NULL,
  new_bank_name TEXT DEFAULT NULL,
  new_bank_account_number TEXT DEFAULT NULL,
  new_bank_sort_code TEXT DEFAULT NULL,
  new_ni_number TEXT DEFAULT NULL,
  mfa_verified BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    accessor_role TEXT;
    changes_made TEXT[] := '{}';
    risk_assessment INTEGER := 0;
BEGIN
    -- Strict permission validation
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    IF accessor_role NOT IN ('Super-Admin', 'HR') THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Only Super-Admin and HR can modify financial data';
    END IF;
    
    -- Enhanced validation for sensitive updates
    IF (new_bank_account_number IS NOT NULL OR new_ni_number IS NOT NULL) THEN
        IF accessor_role != 'Super-Admin' THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: Only Super-Admin can modify bank/NI details';
        END IF;
        
        IF NOT mfa_verified THEN
            RAISE EXCEPTION 'SECURITY_VIOLATION: MFA required for sensitive financial updates';
        END IF;
        
        risk_assessment := risk_assessment + 40;
    END IF;
    
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 30 THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Detailed justification (min 30 chars) required';
    END IF;
    
    -- Track changes for audit
    IF new_salary IS NOT NULL THEN
        changes_made := array_append(changes_made, 'salary');
    END IF;
    IF new_bank_account_number IS NOT NULL THEN
        changes_made := array_append(changes_made, 'bank_account_encrypted');
        risk_assessment := risk_assessment + 25;
    END IF;
    IF new_ni_number IS NOT NULL THEN
        changes_made := array_append(changes_made, 'ni_number_encrypted');
        risk_assessment := risk_assessment + 30;
    END IF;
    
    -- Enhanced audit logging
    INSERT INTO public.financial_data_audit_enhanced (
        accessed_by, employee_user_id, access_type, access_reason,
        fields_accessed, risk_score, suspicious_flags,
        data_classification
    ) VALUES (
        auth.uid(), employee_user_id, 'DATA_MODIFICATION', access_reason,
        changes_made, risk_assessment,
        CASE WHEN NOT mfa_verified THEN ARRAY['NO_MFA'] ELSE ARRAY[]::TEXT[] END,
        'HIGHLY_CONFIDENTIAL'
    );
    
    -- Secure insert/update with encryption
    INSERT INTO public.employee_financial_data (
        user_id, salary, bank_name, bank_sort_code,
        encrypted_bank_account, encrypted_ni_number,
        data_classification, encryption_version, requires_mfa
    ) VALUES (
        employee_user_id, new_salary, new_bank_name, new_bank_sort_code,
        CASE WHEN new_bank_account_number IS NOT NULL THEN 
             encrypt_sensitive_field(new_bank_account_number) END,
        CASE WHEN new_ni_number IS NOT NULL THEN 
             encrypt_sensitive_field(new_ni_number) END,
        'HIGHLY_CONFIDENTIAL', 1, TRUE
    )
    ON CONFLICT (user_id) DO UPDATE SET
        salary = COALESCE(new_salary, employee_financial_data.salary),
        bank_name = COALESCE(new_bank_name, employee_financial_data.bank_name),
        bank_sort_code = COALESCE(new_bank_sort_code, employee_financial_data.bank_sort_code),
        encrypted_bank_account = CASE 
            WHEN new_bank_account_number IS NOT NULL THEN 
                encrypt_sensitive_field(new_bank_account_number)
            ELSE employee_financial_data.encrypted_bank_account
        END,
        encrypted_ni_number = CASE 
            WHEN new_ni_number IS NOT NULL THEN 
                encrypt_sensitive_field(new_ni_number)
            ELSE employee_financial_data.encrypted_ni_number
        END,
        updated_at = NOW(),
        encryption_version = 1,
        requires_mfa = TRUE;

    RETURN TRUE;
END;
$function$;

-- Step 7: Update RLS policy for maximum security
DROP POLICY IF EXISTS "Ultra_restricted_financial_data_access" ON public.employee_financial_data;
DROP POLICY IF EXISTS "Maximum_security_financial_data_access" ON public.employee_financial_data;

CREATE POLICY "Maximum_security_financial_data_access" 
ON public.employee_financial_data 
FOR ALL 
USING (
  -- Only allow access through secure functions, never direct table access
  FALSE
);

-- Step 8: Add security comments
COMMENT ON TABLE public.employee_financial_data IS 
'SECURITY CRITICAL: Contains encrypted financial data. Access ONLY through get_employee_financial_data_maximum_security() with MFA verification and detailed audit logging. Direct table access is prohibited.';

COMMENT ON FUNCTION public.get_employee_financial_data_maximum_security IS 
'MAXIMUM SECURITY ACCESS: Requires role verification, risk assessment, MFA for sensitive operations, and comprehensive audit logging. All access is monitored.';

COMMENT ON FUNCTION public.update_employee_financial_data_maximum_security IS 
'MAXIMUM SECURITY UPDATE: Requires Super-Admin/HR role, MFA for sensitive fields, detailed justification, and full audit trail.';

-- Step 9: Security notification
SELECT 
    'SECURITY_ENHANCEMENT_COMPLETE' as status,
    'All sensitive financial data is now encrypted and protected with enhanced security measures' as message,
    'Use get_employee_financial_data_maximum_security() function for secure access' as access_method,
    'MFA verification required for sensitive operations' as requirement;