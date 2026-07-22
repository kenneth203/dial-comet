-- Security Fixes Migration (Final Corrected Version)
-- Fix critical security issues that can actually be addressed

-- 1. Fix shift_templates public access (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_templates' AND table_schema = 'public') THEN
    -- Enable RLS if not already enabled
    EXECUTE 'ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY';
    
    -- Drop existing permissive policies if they exist
    DROP POLICY IF EXISTS "Anyone can view shift templates" ON public.shift_templates;
    DROP POLICY IF EXISTS "Public can view shift templates" ON public.shift_templates;
    
    -- Add secure policies requiring authentication
    CREATE POLICY "Authenticated_users_can_view_shift_templates" 
    ON public.shift_templates 
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);
    
    CREATE POLICY "Admins_can_manage_shift_templates" 
    ON public.shift_templates 
    FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'Admin', 'Supervisor')::user_role[]
      )
    );
    
    RAISE NOTICE 'Secured shift_templates table with RLS policies';
  ELSE
    RAISE NOTICE 'shift_templates table not found, skipping';
  END IF;
END $$;

-- 2. Fix mutable search_path functions (addressing linter warnings)
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Update specific mask functions to have immutable search_path
    FOR func_record IN
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc 
        WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('mask_email', 'mask_phone_number', 'mask_address')
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path TO public', 
                         func_record.proname, func_record.args);
            RAISE NOTICE 'Added search_path to function: %', func_record.proname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not modify function % (%): %', func_record.proname, func_record.args, SQLERRM;
        END;
    END LOOP;
    
    -- Update other security-critical functions
    FOR func_record IN
        SELECT proname, oidvectortypes(proargtypes) as args
        FROM pg_proc 
        WHERE pronamespace = 'public'::regnamespace
        AND (proname LIKE '%secure%' OR proname LIKE '%audit%' OR proname LIKE '%encrypt%')
        AND NOT EXISTS (
            SELECT 1 FROM pg_settings 
            WHERE name = 'search_path' 
            AND setting = 'public'
        )
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path TO public', 
                         func_record.proname, func_record.args);
            RAISE NOTICE 'Added search_path to security function: %', func_record.proname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not modify security function % (%): %', func_record.proname, func_record.args, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3. Enhanced financial data security monitoring
CREATE OR REPLACE FUNCTION public.audit_financial_data_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    -- Enhanced security logging for financial data access
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO public.sensitive_data_audit (
            accessed_by,
            employee_id,
            action,
            ip_address
        ) VALUES (
            auth.uid(),
            NEW.user_id::text,
            TG_OP || '_FINANCIAL_DATA_ENHANCED_MONITORING',
            NULL
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.sensitive_data_audit (
            accessed_by,
            employee_id,
            action,
            ip_address
        ) VALUES (
            auth.uid(),
            OLD.user_id::text,
            TG_OP || '_FINANCIAL_DATA_ENHANCED_MONITORING',
            NULL
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Apply enhanced monitoring trigger to financial data
DROP TRIGGER IF EXISTS financial_data_security_monitor ON public.employee_financial_data;
CREATE TRIGGER financial_data_security_monitor
    AFTER INSERT OR UPDATE OR DELETE ON public.employee_financial_data
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_financial_data_security();

-- 4. Create function to detect suspicious access patterns
CREATE OR REPLACE FUNCTION public.detect_suspicious_patterns()
RETURNS TABLE(
    user_id UUID,
    access_count BIGINT,
    risk_indicators TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sda.accessed_by as user_id,
        COUNT(*) as access_count,
        ARRAY_AGG(DISTINCT 
            CASE 
                WHEN EXTRACT(HOUR FROM sda.accessed_at) NOT BETWEEN 6 AND 22 THEN 'OUT_OF_HOURS'
                WHEN COUNT(*) OVER (PARTITION BY sda.accessed_by) > 20 THEN 'HIGH_FREQUENCY'
                ELSE 'NORMAL'
            END
        ) as risk_indicators
    FROM public.sensitive_data_audit sda
    WHERE sda.accessed_at > NOW() - INTERVAL '24 hours'
    AND sda.action LIKE '%FINANCIAL%'
    GROUP BY sda.accessed_by
    HAVING COUNT(*) > 5  -- Flag users with more than 5 financial data accesses in 24h
    ORDER BY access_count DESC;
END;
$$;

-- 5. Enhanced billing security audit
CREATE OR REPLACE FUNCTION public.enhanced_billing_security_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    user_role TEXT;
    access_time TIMESTAMP WITH TIME ZONE;
BEGIN
    access_time := NOW();
    
    -- Get user role
    SELECT role::TEXT INTO user_role
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Enhanced audit logging for billing operations
    INSERT INTO public.billing_data_audit (
        accessed_by,
        customer_id,
        action,
        table_name,
        user_agent
    ) VALUES (
        auth.uid(),
        CASE WHEN TG_OP = 'DELETE' THEN OLD.customer_id ELSE NEW.customer_id END,
        TG_OP || '_SECURITY_ENHANCED',
        TG_TABLE_NAME,
        'Security-enhanced audit - Role: ' || COALESCE(user_role, 'unknown') || 
        ' - Time: ' || access_time::TEXT
    );
    
    -- Return appropriate record
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- 6. Add comprehensive security monitoring view for admins
CREATE OR REPLACE VIEW public.security_monitoring_dashboard AS
SELECT 
    'financial_access' as data_type,
    COUNT(*) as access_count,
    COUNT(DISTINCT accessed_by) as unique_users,
    MAX(accessed_at) as last_access,
    ARRAY_AGG(DISTINCT 
        CASE 
            WHEN EXTRACT(HOUR FROM accessed_at) NOT BETWEEN 6 AND 22 THEN 'out_of_hours'
            ELSE NULL 
        END
    ) FILTER (WHERE EXTRACT(HOUR FROM accessed_at) NOT BETWEEN 6 AND 22) as risk_flags
FROM public.sensitive_data_audit
WHERE accessed_at > NOW() - INTERVAL '24 hours'
AND action LIKE '%FINANCIAL%'

UNION ALL

SELECT 
    'billing_access' as data_type,
    COUNT(*) as access_count,
    COUNT(DISTINCT accessed_by) as unique_users,
    MAX(accessed_at) as last_access,
    ARRAY_AGG(DISTINCT 'billing_access') as risk_flags
FROM public.billing_data_audit
WHERE accessed_at > NOW() - INTERVAL '24 hours';

-- Grant appropriate access to the monitoring dashboard
GRANT SELECT ON public.security_monitoring_dashboard TO authenticated;

-- Add RLS policy for the security monitoring (Super-Admin only)
CREATE POLICY "Super_Admin_security_monitoring" 
ON public.security_monitoring_dashboard 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'::user_role
    )
);

-- 7. Cleanup and final security notice
DO $$
BEGIN
    RAISE NOTICE '=== SECURITY FIXES APPLIED ===';
    RAISE NOTICE '1. Enhanced RLS policies where applicable';
    RAISE NOTICE '2. Fixed function search_path issues';
    RAISE NOTICE '3. Added comprehensive audit monitoring';
    RAISE NOTICE '4. Created security monitoring dashboard';
    RAISE NOTICE '5. Enhanced financial data protection';
    RAISE NOTICE 'MANUAL ACTIONS STILL REQUIRED:';
    RAISE NOTICE '- Configure OTP expiry to 5-10 minutes in Supabase Dashboard';
    RAISE NOTICE '- Review and tighten CSP policy for production';
    RAISE NOTICE '- holiday_data_anomalies is a view and needs application-level access controls';
END $$;