-- =============================================
-- SECURE PERMISSIONS MATRIX ACCESS CONTROL - CLEAN SLATE
-- =============================================

-- Step 1: Drop all potentially conflicting functions
DROP FUNCTION IF EXISTS public.update_permission_grant_secure(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.update_permission_grant(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.detect_permissions_security_threats();

-- Step 2: Create the main secure access function (enhanced)
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
    -- Only allow Super-Admin and Admin access to permissions matrix
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'Admin')
        AND status = 'Active'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin and Admin can access permissions matrix';
    END IF;

    -- Log the access attempt for security auditing
    INSERT INTO public.system_users_audit_log (
        accessed_by, 
        employee_user_id, 
        access_type, 
        access_reason, 
        fields_accessed,
        risk_score
    ) VALUES (
        auth.uid(), 
        '00000000-0000-0000-0000-000000000001'::UUID, -- Special marker for permissions access
        'PERMISSIONS_MATRIX_ACCESS',
        'Administrative permissions matrix access',
        ARRAY['permissions', 'roles', 'grants'],
        5 -- Low risk for authorized admin access
    );

    -- Return the secure permissions matrix data
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

-- Step 3: Create secure permission update function
CREATE FUNCTION public.admin_update_permission_grant(
    p_permission_id UUID,
    p_role TEXT,
    p_granted BOOLEAN,
    p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only Super-Admin and Admin can update permissions
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'Admin')
        AND status = 'Active'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin and Admin can update permissions';
    END IF;

    -- Require a detailed reason for the change
    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10 THEN
        RAISE EXCEPTION 'Admin reason required: Please provide a detailed reason for this permission change';
    END IF;

    -- Log the permission change with high security audit trail
    INSERT INTO public.system_users_audit_log (
        accessed_by, 
        employee_user_id, 
        access_type, 
        access_reason, 
        fields_accessed,
        risk_score
    ) VALUES (
        auth.uid(), 
        '00000000-0000-0000-0000-000000000002'::UUID, -- Special marker for permission changes
        'PERMISSION_GRANT_MODIFICATION',
        'Permission change: ' || p_reason,
        ARRAY['permission_id:' || p_permission_id::text, 'role:' || p_role, 'granted:' || p_granted::text],
        15 -- Higher risk score for permission changes
    );

    -- Insert or update the permission grant using the existing function
    RETURN update_permission_grant(p_permission_id, p_role, p_granted);
END;
$$;

-- Step 4: Create security monitoring function
CREATE FUNCTION public.analyze_permissions_access_patterns()
RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    matrix_accesses BIGINT,
    permission_modifications BIGINT,
    last_activity TIMESTAMP WITH TIME ZONE,
    threat_level TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only Super-Admin can run this security analysis
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'
        AND status = 'Active'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin can analyze permissions access patterns';
    END IF;

    RETURN QUERY
    SELECT 
        a.accessed_by as user_id,
        p.name as user_name,
        COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSIONS_MATRIX%') as matrix_accesses,
        COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_GRANT%') as permission_modifications,
        MAX(a.access_time) as last_activity,
        CASE 
            WHEN COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_GRANT%') > 10 THEN 'CRITICAL'
            WHEN COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_GRANT%') > 5 THEN 'HIGH'
            WHEN COUNT(*) > 20 THEN 'MEDIUM'
            ELSE 'LOW'
        END as threat_level
    FROM public.system_users_audit_log a
    LEFT JOIN public.profiles p ON p.user_id = a.accessed_by
    WHERE a.access_type LIKE '%PERMISSION%'
        AND a.access_time > NOW() - INTERVAL '30 days'
    GROUP BY a.accessed_by, p.name
    HAVING COUNT(*) > 0
    ORDER BY permission_modifications DESC, matrix_accesses DESC;
END;
$$;

-- Step 5: Secure the view by ensuring it always returns empty
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
WHERE 1=0; -- Mathematical impossibility - ensures no data ever returns

-- Step 6: Add security documentation
COMMENT ON VIEW public.v_permissions_matrix_secure IS 'SECURITY LOCKDOWN: This view is intentionally empty. Use get_permissions_matrix_secure() function for authorized access only.';
COMMENT ON FUNCTION public.get_permissions_matrix_secure IS 'ADMIN ONLY: Secure access to permissions matrix with full audit logging';
COMMENT ON FUNCTION public.admin_update_permission_grant IS 'ADMIN ONLY: Secure function to modify permissions with mandatory justification';
COMMENT ON FUNCTION public.analyze_permissions_access_patterns IS 'SUPER-ADMIN ONLY: Security threat analysis for permissions access';

-- Step 7: Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_permissions_matrix_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_permission_grant TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_permissions_access_patterns TO authenticated;