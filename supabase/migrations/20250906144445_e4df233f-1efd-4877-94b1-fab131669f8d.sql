-- CRITICAL SECURITY FIXES: Comprehensive security hardening (corrected)

-- Fix 1: Revoke execute privileges from anonymous users on sensitive RPC functions
REVOKE EXECUTE ON FUNCTION public.get_employee_financial_data_ultra_secure FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_employee_financial_data_maximum_security FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_employee_financial_data_secure FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_contact_info_secure FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_sensitive_data_access FROM anon;
REVOKE EXECUTE ON FUNCTION public.detect_suspicious_financial_access FROM anon;

-- Fix 2: Tighten RLS on shift_templates table (create table if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_templates') THEN
        CREATE TABLE public.shift_templates (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            role_name text NOT NULL,
            start_time time NOT NULL,
            end_time time NOT NULL,
            headcount_needed integer NOT NULL DEFAULT 1,
            color_code text DEFAULT '#3b82f6',
            days_of_week integer[] DEFAULT '{}',
            is_active boolean DEFAULT true,
            created_by uuid REFERENCES auth.users(id),
            created_at timestamp with time zone DEFAULT now(),
            updated_at timestamp with time zone DEFAULT now()
        );
        
        ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Create restrictive RLS policies for shift_templates
DROP POLICY IF EXISTS "Admin only access to shift templates" ON public.shift_templates;
CREATE POLICY "Admin only access to shift templates"
ON public.shift_templates
FOR ALL
USING (is_admin_or_higher())
WITH CHECK (is_admin_or_higher());

-- Fix 3: Add audit logging for sensitive operations (corrected trigger syntax)
CREATE OR REPLACE FUNCTION public.log_sensitive_table_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Log access to sensitive tables for INSERT/UPDATE/DELETE only
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        auth.uid(),
        COALESCE(NEW.user_id, OLD.user_id),
        'DIRECT_TABLE_ACCESS_' || TG_TABLE_NAME,
        'Direct access via ' || TG_OP,
        10 -- Medium risk for direct access
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply audit triggers to sensitive tables (INSERT/UPDATE/DELETE only)
DROP TRIGGER IF EXISTS audit_employee_financial_data_changes ON public.employee_financial_data;
CREATE TRIGGER audit_employee_financial_data_changes
    BEFORE INSERT OR UPDATE OR DELETE ON public.employee_financial_data
    FOR EACH ROW EXECUTE FUNCTION public.log_sensitive_table_access();

-- Fix 4: Create secure database reset function with enhanced validation
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
        'Complete database reset performed with code: ' || confirmation_code,
        0 -- Authorized operation
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

-- Fix 5: Revoke execute from anon on the reset function
REVOKE EXECUTE ON FUNCTION public.perform_database_reset FROM anon;
GRANT EXECUTE ON FUNCTION public.perform_database_reset TO authenticated;

-- Security hardening notification
SELECT 'CRITICAL_SECURITY_FIXES_APPLIED: Database RPCs secured, audit logging enhanced, reset function protected' as status;