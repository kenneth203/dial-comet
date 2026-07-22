-- =============================================
-- SECURE PERMISSIONS MATRIX - FINAL CLEANUP AND SETUP
-- =============================================

-- Step 1: Drop ALL existing permission-related functions with full signatures
DROP FUNCTION IF EXISTS public.admin_update_permission_grant(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.update_permission_grant_secure(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.update_permission_grant(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.detect_permissions_security_threats();
DROP FUNCTION IF EXISTS public.analyze_permissions_access_patterns();

-- Step 2: Enhanced secure permissions matrix access function
CREATE OR REPLACE FUNCTION public.get_permissions_matrix_secure()
RETURNS TABLE(
    id UUID,
    granted BOOLEAN,
    grant_id UUID,
    feature TEXT,
    icon TEXT,
    description TEXT,
    role TEXT,
    section TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Strict access control - only Super-Admin and Admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'Admin')
        AND status = 'Active'
    ) THEN
        -- Log unauthorized access attempt
        INSERT INTO public.system_users_audit_log (
            accessed_by, employee_user_id, access_type, access_reason, 
            fields_accessed, risk_score
        ) VALUES (
            auth.uid(), '00000000-0000-0000-0000-000000000099'::UUID,
            'UNAUTHORIZED_PERMISSIONS_ACCESS', 'Blocked permissions matrix access attempt',
            ARRAY['permissions_matrix'], 25
        );
        
        RAISE EXCEPTION 'Access denied: Only Super-Admin and Admin can access permissions matrix';
    END IF;

    -- Log authorized access
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, 
        fields_accessed, risk_score
    ) VALUES (
        auth.uid(), '00000000-0000-0000-0000-000000000001'::UUID,
        'PERMISSIONS_MATRIX_ACCESS', 'Administrative permissions matrix access',
        ARRAY['permissions', 'roles', 'grants'], 5
    );

    -- Return secure permissions data
    RETURN QUERY
    SELECT 
        p.id,
        COALESCE(pg.granted, false) as granted,
        pg.id as grant_id,
        p.feature,
        p.icon,
        p.description,
        pg.role,
        p.section
    FROM public.app_permissions p
    LEFT JOIN public.app_permission_grants pg ON (p.id = pg.permission_id)
    ORDER BY p.section, p.feature, pg.role;
END;
$$;

-- Step 3: Create completely new permission update function
CREATE FUNCTION public.secure_permission_update(
    p_permission_id UUID,
    p_role TEXT,
    p_granted BOOLEAN,
    p_justification TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Strict access control
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'Admin')
        AND status = 'Active'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin and Admin can modify permissions';
    END IF;

    -- Mandatory justification
    IF p_justification IS NULL OR LENGTH(TRIM(p_justification)) < 15 THEN
        RAISE EXCEPTION 'Justification required: Please provide a detailed reason (minimum 15 characters) for this permission change';
    END IF;

    -- High-security audit log
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, 
        fields_accessed, risk_score
    ) VALUES (
        auth.uid(), '00000000-0000-0000-0000-000000000002'::UUID,
        'PERMISSION_MODIFICATION', 'Permission change: ' || p_justification,
        ARRAY['permission_id:' || p_permission_id::text, 'role:' || p_role, 'granted:' || p_granted::text], 
        20 -- High risk score for permission changes
    );

    -- Execute the permission change
    INSERT INTO public.app_permission_grants (permission_id, role, granted)
    VALUES (p_permission_id, p_role, p_granted)
    ON CONFLICT (permission_id, role) 
    DO UPDATE SET 
        granted = p_granted,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Step 4: Security threat detection function
CREATE FUNCTION public.permissions_threat_monitor()
RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    access_count BIGINT,
    modification_count BIGINT,
    unauthorized_attempts BIGINT,
    last_activity TIMESTAMP WITH TIME ZONE,
    risk_assessment TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Super-Admin only security function
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'
        AND status = 'Active'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin can monitor permissions security threats';
    END IF;

    -- Return security analysis
    RETURN QUERY
    SELECT 
        a.accessed_by as user_id,
        p.name as user_name,
        COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSIONS_MATRIX%') as access_count,
        COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_MODIFICATION%') as modification_count,
        COUNT(*) FILTER (WHERE a.access_type LIKE '%UNAUTHORIZED_PERMISSIONS%') as unauthorized_attempts,
        MAX(a.access_time) as last_activity,
        CASE 
            WHEN COUNT(*) FILTER (WHERE a.access_type LIKE '%UNAUTHORIZED_PERMISSIONS%') > 0 THEN 'CRITICAL_THREAT'
            WHEN COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_MODIFICATION%') > 10 THEN 'HIGH_RISK'
            WHEN COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_MODIFICATION%') > 3 THEN 'MEDIUM_RISK'
            WHEN COUNT(*) > 15 THEN 'ELEVATED'
            ELSE 'NORMAL'
        END as risk_assessment
    FROM public.system_users_audit_log a
    LEFT JOIN public.profiles p ON p.user_id = a.accessed_by
    WHERE a.access_type LIKE '%PERMISSION%'
        AND a.access_time > NOW() - INTERVAL '30 days'
    GROUP BY a.accessed_by, p.name
    HAVING COUNT(*) > 0
    ORDER BY unauthorized_attempts DESC, modification_count DESC, access_count DESC;
END;
$$;

-- Step 5: Lock down the view completely
DROP VIEW IF EXISTS public.v_permissions_matrix_secure;
CREATE VIEW public.v_permissions_matrix_secure AS
SELECT 
    NULL::uuid AS id,
    NULL::boolean AS granted,
    NULL::uuid AS grant_id,
    NULL::text AS feature,
    NULL::text AS icon,
    NULL::text AS description,
    NULL::text AS role,
    NULL::text AS section
WHERE FALSE -- Explicit FALSE condition - mathematically impossible to return data
LIMIT 0;

-- Step 6: Security documentation
COMMENT ON VIEW public.v_permissions_matrix_secure IS 'SECURITY WARNING: This view is intentionally locked down and returns no data. All access must go through get_permissions_matrix_secure() function with proper authorization.';
COMMENT ON FUNCTION public.get_permissions_matrix_secure IS 'RESTRICTED ACCESS: Permissions matrix data accessible only to Super-Admin and Admin roles with full audit trail';
COMMENT ON FUNCTION public.secure_permission_update IS 'HIGH SECURITY: Permission modification function requiring Admin+ role and mandatory detailed justification';
COMMENT ON FUNCTION public.permissions_threat_monitor IS 'SECURITY MONITORING: Super-Admin only function to detect and analyze permissions-related security threats';

-- Step 7: Grant minimal necessary permissions
GRANT EXECUTE ON FUNCTION public.get_permissions_matrix_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.secure_permission_update TO authenticated;
GRANT EXECUTE ON FUNCTION public.permissions_threat_monitor TO authenticated;

-- Step 8: Final verification comment
-- Underlying tables app_permissions and app_permission_grants have blocking RLS policies
-- View v_permissions_matrix_secure returns no data and has no RLS (not needed since it's empty)
-- All access is controlled through secure functions with role-based authentication and audit logging