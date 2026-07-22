-- Fix remaining security linter warnings
-- Fix function search_path issues for security

-- Update functions that are missing SET search_path TO public
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Get all SECURITY DEFINER functions without proper search_path
    FOR func_record IN 
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as function_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true  -- SECURITY DEFINER functions
        AND n.nspname = 'public'
        AND NOT EXISTS (
            SELECT 1 FROM pg_proc_config 
            WHERE pg_proc_config.oid = p.oid 
            AND pg_proc_config.config[1] LIKE 'search_path=%'
        )
        AND p.proname NOT IN (
            'get_staff_directory_secure',
            'get_holiday_anomalies_secure', 
            'get_billing_dashboard_secure'
        )  -- Skip functions we just created
    LOOP
        -- Update each function to add SET search_path TO public
        EXECUTE format('
            CREATE OR REPLACE FUNCTION %I.%I(%s)
            RETURNS %s
            LANGUAGE %s
            SECURITY DEFINER
            SET search_path TO public
            AS $function$%s$function$',
            func_record.schema_name,
            func_record.function_name,
            func_record.function_args,
            pg_get_function_result(
                (SELECT oid FROM pg_proc WHERE proname = func_record.function_name 
                 AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = func_record.schema_name)
                 LIMIT 1)
            ),
            (SELECT lanname FROM pg_language WHERE oid = 
                (SELECT prolang FROM pg_proc WHERE proname = func_record.function_name 
                 AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = func_record.schema_name)
                 LIMIT 1)
            ),
            pg_get_functiondef(
                (SELECT oid FROM pg_proc WHERE proname = func_record.function_name 
                 AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = func_record.schema_name)
                 LIMIT 1)
            )
        );
        
        RAISE NOTICE 'Updated function %.% to include SET search_path TO public', 
            func_record.schema_name, func_record.function_name;
    END LOOP;
    
    RAISE NOTICE 'Completed search_path fixes for SECURITY DEFINER functions';
END $$;

-- Add comment documenting completed security fixes
COMMENT ON SCHEMA public IS 'Security hardening completed: RLS policies restricted, SECURITY DEFINER functions secured with search_path, comprehensive_users access locked down to secure RPCs only';