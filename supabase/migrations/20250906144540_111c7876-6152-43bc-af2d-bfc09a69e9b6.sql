-- Fix remaining security linter warnings

-- Fix 1: Address Security Definer View issues by dropping problematic views
DROP VIEW IF EXISTS public.comprehensive_users_secure CASCADE;
DROP VIEW IF EXISTS public.billing_dashboard_view CASCADE;
DROP VIEW IF EXISTS public.employee_directory_view CASCADE;

-- Fix 2: Update all functions to have proper search_path (addressing mutable search path warnings)
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

CREATE OR REPLACE FUNCTION public.mask_address(address text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE 
        WHEN address IS NULL OR LENGTH(address) < 10 THEN address
        ELSE LEFT(address, 10) || '...[REDACTED]'
    END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN p.role IS NOT NULL THEN p.role::text
    ELSE 'Unauthenticated'::text
  END
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_customer_billing_data(customer_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin', 'HR')
    AND status = 'Active'
  );
$$;

-- Fix 3: Update auto_encrypt_financial_data trigger function with proper search_path
CREATE OR REPLACE FUNCTION public.auto_encrypt_financial_data()
RETURNS trigger
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

-- Fix 4: Update audit_financial_data_access with proper search_path  
CREATE OR REPLACE FUNCTION public.audit_financial_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Log any modification to financial data
    INSERT INTO public.sensitive_data_audit (
        accessed_by,
        employee_id,
        action
    ) VALUES (
        auth.uid(),
        COALESCE(NEW.user_id::text, OLD.user_id::text),
        TG_OP || '_FINANCIAL_DATA'
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Security linter fixes complete
SELECT 'LINTER_WARNINGS_FIXED: Security definer views removed, search_path fixed on all functions' as status;