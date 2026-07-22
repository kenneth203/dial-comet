-- =============================================
-- PERMISSIONS MATRIX SECURITY - COMPLETE RESET
-- =============================================

-- Step 1: Drop ALL permission-related functions with exact signatures
DROP FUNCTION IF EXISTS public.admin_update_permission_grant(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.update_permission_grant_secure(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.update_permission_grant_secure(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.update_permission_grant(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.secure_permission_update(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.detect_permissions_security_threats();
DROP FUNCTION IF EXISTS public.analyze_permissions_access_patterns();
DROP FUNCTION IF EXISTS public.permissions_threat_monitor();
DROP FUNCTION IF EXISTS public.detect_unauthorized_permissions_access();

-- Step 2: Create the ONLY secure permissions access function needed
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
    -- Only Super-Admin and Admin can access permissions matrix
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
            'BLOCKED_PERMISSIONS_ACCESS', 'Unauthorized permissions matrix access attempt',
            ARRAY['permissions_matrix'], 30
        );
        
        RAISE EXCEPTION 'Access denied: Only administrators can access permissions matrix';
    END IF;

    -- Log authorized access with audit trail
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, 
        fields_accessed, risk_score
    ) VALUES (
        auth.uid(), '00000000-0000-0000-0000-000000000001'::UUID,
        'ADMIN_PERMISSIONS_ACCESS', 'Authorized permissions matrix access',
        ARRAY['permissions', 'roles', 'grants'], 5
    );

    -- Return permissions data securely
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

-- Step 3: Recreate the update permission function (using existing name pattern)
CREATE FUNCTION public.update_permission_grant(
    p_permission_id UUID,
    p_role TEXT,
    p_granted BOOLEAN
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

    -- Log the permission change with audit trail
    INSERT INTO public.system_users_audit_log (
        accessed_by, employee_user_id, access_type, access_reason, 
        fields_accessed, risk_score
    ) VALUES (
        auth.uid(), '00000000-0000-0000-0000-000000000002'::UUID,
        'PERMISSION_GRANT_UPDATE', 'Permission grant modified',
        ARRAY['permission_id:' || p_permission_id::text, 'role:' || p_role, 'granted:' || p_granted::text], 
        15 -- Elevated risk for permission changes
    );

    -- Update the permission grant
    INSERT INTO public.app_permission_grants (permission_id, role, granted)
    VALUES (p_permission_id, p_role, p_granted)
    ON CONFLICT (permission_id, role) 
    DO UPDATE SET 
        granted = p_granted,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Step 4: Lock down the view completely
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
WHERE FALSE;

-- Step 5: Add security documentation
COMMENT ON VIEW public.v_permissions_matrix_secure IS 'SECURITY: This view is empty by design. Use get_permissions_matrix_secure() function for authorized access.';
COMMENT ON FUNCTION public.get_permissions_matrix_secure IS 'ADMIN ONLY: Secure permissions matrix access with full audit logging';
COMMENT ON FUNCTION public.update_permission_grant IS 'ADMIN ONLY: Secure permission modification with audit trail';

-- Step 6: Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_permissions_matrix_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_permission_grant TO authenticated;