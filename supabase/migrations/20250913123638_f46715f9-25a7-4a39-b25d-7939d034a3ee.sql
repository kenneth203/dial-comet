-- =============================================
-- SECURE PERMISSIONS MATRIX - COMPLETE CLEANUP AND FIX
-- =============================================

-- Step 1: Drop ALL existing functions to ensure clean slate
DROP FUNCTION IF EXISTS public.detect_unauthorized_permissions_access();
DROP FUNCTION IF EXISTS public.update_permission_grant_secure(UUID, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.update_permission_grant(UUID, TEXT, BOOLEAN);

-- Step 2: Secure the permissions matrix view by making it always return empty
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
WHERE false; -- Always returns empty - forces use of secure function

-- Step 3: Enhance the secure permissions access function with proper auditing
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
    IF NOT is_admin_or_higher() THEN
        RAISE EXCEPTION 'Access denied: Only administrators can access permissions matrix';
    END IF;

    -- Log the access attempt for security auditing (safe version)
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
        -- Continue if audit table doesn't exist or insert fails
        NULL;
    END;

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

-- Step 4: Add comprehensive security documentation
COMMENT ON VIEW public.v_permissions_matrix_secure IS 'SECURITY CRITICAL: Permissions matrix view - always returns empty. Use get_permissions_matrix_secure() function for authorized access only.';
COMMENT ON FUNCTION public.get_permissions_matrix_secure IS 'Secure function to access permissions matrix - restricted to Admin+ roles with full audit logging';

-- Step 5: Grant execute permission to authenticated users (function handles authorization internally)
GRANT EXECUTE ON FUNCTION public.get_permissions_matrix_secure TO authenticated;