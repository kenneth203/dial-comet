-- Fix security warning: Function Search Path Mutable
-- Set search_path for functions that don't have it properly configured

-- Update the log_comprehensive_users_access function to have proper search_path
CREATE OR REPLACE FUNCTION log_comprehensive_users_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Log any modification to comprehensive_users table
    INSERT INTO public.sensitive_data_audit (
        accessed_by,
        employee_id, 
        action,
        timestamp
    ) VALUES (
        auth.uid(),
        COALESCE(NEW.auth_user_id::text, OLD.auth_user_id::text),
        TG_OP || '_COMPREHENSIVE_USERS',
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Check and update other functions that might be missing search_path
-- Update mask_email function
CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT CASE 
        WHEN email IS NULL OR POSITION('@' IN email) = 0 THEN email
        ELSE LEFT(email, 2) || '***@' || SPLIT_PART(email, '@', 2)
    END;
$$;

-- Update mask_phone_number function
CREATE OR REPLACE FUNCTION public.mask_phone_number(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT CASE 
        WHEN phone IS NULL OR LENGTH(phone) < 4 THEN phone
        ELSE SUBSTRING(phone FROM 1 FOR 3) || '***' || RIGHT(phone, 2)
    END;
$$;

-- Update mask_address function
CREATE OR REPLACE FUNCTION public.mask_address(address text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT CASE 
        WHEN address IS NULL OR LENGTH(address) < 10 THEN address
        ELSE LEFT(address, 10) || '...[REDACTED]'
    END;
$$;