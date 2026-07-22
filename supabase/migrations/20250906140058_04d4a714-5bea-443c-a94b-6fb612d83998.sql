-- Security Fixes Migration (Final Version - Corrected Role Syntax)

-- 1. Fix shift_templates public access (if table exists) with corrected role syntax
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_templates' AND table_schema = 'public') THEN
    -- Enable RLS if not already enabled
    EXECUTE 'ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY';
    
    -- Drop existing permissive policies if they exist
    DROP POLICY IF EXISTS "Anyone can view shift templates" ON public.shift_templates;
    DROP POLICY IF EXISTS "Public can view shift templates" ON public.shift_templates;
    
    -- Add secure policies requiring authentication (fixed role syntax)
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
        AND role = ANY(ARRAY['Super-Admin', 'Admin', 'Supervisor']::user_role[])
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
            RAISE NOTICE 'Fixed search_path for function: %', func_record.proname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not modify function % (%): %', func_record.proname, func_record.args, SQLERRM;
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
            TG_OP || '_FINANCIAL_SECURITY_MONITOR',
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
            TG_OP || '_FINANCIAL_SECURITY_MONITOR',
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
CREATE OR REPLACE FUNCTION public.detect_suspicious_financial_access()
RETURNS TABLE(
    suspicious_user_id UUID,
    access_count BIGINT,
    risk_level TEXT,
    latest_access TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    -- Only Super-Admin can run this analysis
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() AND role = 'Super-Admin'::user_role
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin can analyze access patterns';
    END IF;
    
    RETURN QUERY
    SELECT 
        sda.accessed_by as suspicious_user_id,
        COUNT(*) as access_count,
        CASE 
            WHEN COUNT(*) > 20 THEN 'HIGH'
            WHEN COUNT(*) > 10 THEN 'MEDIUM'
            ELSE 'LOW'
        END as risk_level,
        MAX(sda.accessed_at) as latest_access
    FROM public.sensitive_data_audit sda
    WHERE sda.accessed_at > NOW() - INTERVAL '24 hours'
    AND sda.action LIKE '%FINANCIAL%'
    GROUP BY sda.accessed_by
    HAVING COUNT(*) > 3  -- Flag users with more than 3 financial accesses in 24h
    ORDER BY access_count DESC;
END;
$$;

-- 5. Update CSP policy in code (this will need to be applied via code update)
-- Note: This is handled in the index.html update that follows

-- 6. Final security status logging
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '       SECURITY FIXES COMPLETED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXED:';
    RAISE NOTICE '✓ Function search_path issues (linter warnings)';
    RAISE NOTICE '✓ Enhanced financial data monitoring';
    RAISE NOTICE '✓ Added suspicious access pattern detection'; 
    RAISE NOTICE '✓ Secured shift_templates if present';
    RAISE NOTICE '';
    RAISE NOTICE 'MANUAL ACTIONS REQUIRED:';
    RAISE NOTICE '⚠ Configure OTP expiry to 5-10 minutes in Supabase Dashboard';
    RAISE NOTICE '⚠ holiday_data_anomalies is a VIEW - needs app-level controls';
    RAISE NOTICE '⚠ Review CSP policy for production deployment';
    RAISE NOTICE '========================================';
END $$;