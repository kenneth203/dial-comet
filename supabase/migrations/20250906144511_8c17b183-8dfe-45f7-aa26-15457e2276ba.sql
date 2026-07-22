-- CRITICAL SECURITY FIXES: Comprehensive security hardening (final)

-- Fix 1: Revoke execute privileges from anonymous users on sensitive RPC functions
REVOKE EXECUTE ON FUNCTION public.get_employee_financial_data_ultra_secure FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_employee_financial_data_maximum_security FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_employee_financial_data_secure FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_contact_info_secure FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_sensitive_data_access FROM anon;
REVOKE EXECUTE ON FUNCTION public.detect_suspicious_financial_access FROM anon;

-- Fix 2: Drop and recreate database reset function with proper security
DROP FUNCTION IF EXISTS public.perform_database_reset;
CREATE OR REPLACE FUNCTION public.perform_database_reset(confirmation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Verify user is Super-Admin
    SELECT role::TEXT INTO user_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    IF user_role != 'Super-Admin' THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Only Super-Admin can perform database reset';
    END IF;
    
    -- Verify confirmation code
    IF confirmation_code != 'RESET_ALL_DATA_CONFIRM' THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Invalid confirmation code';
    END IF;
    
    -- Log the reset operation
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        auth.uid(),
        NULL,
        'DATABASE_RESET',
        'Complete database reset performed',
        0
    );
    
    -- Perform selective data cleanup (preserve system config and user accounts)
    DELETE FROM public.customers;
    DELETE FROM public.news_items;
    DELETE FROM public.todos;
    DELETE FROM public.billing_line_items;
    DELETE FROM public.billing_periods;
    DELETE FROM public.billing_invoices;
    DELETE FROM public.call_logs;
    DELETE FROM public.holiday_requests;
    DELETE FROM public.status_timing_logs;
    
    -- Reset holiday entitlements to defaults
    UPDATE public.holiday_entitlements 
    SET 
        annual_leave_days = 25.0,
        sick_leave_days = 10.0,
        personal_days = 5.0,
        carried_over_days = 0.0;
    
    RETURN true;
END;
$$;

-- Fix 3: Secure function permissions
REVOKE EXECUTE ON FUNCTION public.perform_database_reset FROM anon;
REVOKE EXECUTE ON FUNCTION public.perform_database_reset FROM authenticated;
GRANT EXECUTE ON FUNCTION public.perform_database_reset TO authenticated;

-- Fix 4: Add enhanced audit logging function
CREATE OR REPLACE FUNCTION public.log_sensitive_operation(
    operation_type text,
    target_user_id uuid DEFAULT NULL,
    operation_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        auth.uid(),
        target_user_id,
        operation_type,
        COALESCE(operation_details, 'Sensitive operation performed'),
        5 -- Default medium risk
    );
END;
$$;

-- Fix 5: Tighten RLS on shift_templates if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_templates') THEN
        DROP POLICY IF EXISTS "Admin only access to shift templates" ON public.shift_templates;
        CREATE POLICY "Admin only access to shift templates"
        ON public.shift_templates
        FOR ALL
        USING (is_admin_or_higher())
        WITH CHECK (is_admin_or_higher());
    END IF;
END $$;

-- Security hardening complete
SELECT 'CRITICAL_SECURITY_FIXES_APPLIED: Anonymous access revoked, reset function secured, audit logging implemented' as status;