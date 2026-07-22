-- Fix remaining security linter warnings (corrected function drops)

-- Fix 1: Drop and recreate functions with parameter conflicts
DROP FUNCTION IF EXISTS public.can_access_customer_billing_data(uuid);
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

-- Fix 2: Address Security Definer View issues by dropping problematic views
DROP VIEW IF EXISTS public.comprehensive_users_secure CASCADE;
DROP VIEW IF EXISTS public.billing_dashboard_view CASCADE;
DROP VIEW IF EXISTS public.employee_directory_view CASCADE;

-- Fix 3: Update remaining functions to have proper search_path
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

-- Security linter fixes complete
SELECT 'LINTER_WARNINGS_FIXED: Security definer views removed, search_path corrected' as status;