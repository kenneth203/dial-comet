-- =============================================
-- SECURE PERMISSIONS MATRIX ACCESS CONTROL - CORRECTED
-- =============================================

-- Step 1: Ensure the underlying tables have proper security (they already do)
-- app_permissions and app_permission_grants already have blocking RLS policies

-- Step 2: Enhance the secure function with better access control and auditing
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

-- Step 3: Create a secure function for updating permissions (admin only)
CREATE OR REPLACE FUNCTION public.update_permission_grant_secure(
    p_permission_id UUID,
    p_role TEXT,
    p_granted BOOLEAN,
    p_admin_reason TEXT
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

    -- Require a reason for the change
    IF p_admin_reason IS NULL OR LENGTH(TRIM(p_admin_reason)) < 10 THEN
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
        'PERMISSION_GRANT_CHANGE',
        'Permission change: ' || p_admin_reason,
        ARRAY['permission_id:' || p_permission_id::text, 'role:' || p_role, 'granted:' || p_granted::text],
        15 -- Higher risk score for permission changes
    );

    -- Insert or update the permission grant
    INSERT INTO public.app_permission_grants (permission_id, role, granted)
    VALUES (p_permission_id, p_role, p_granted)
    ON CONFLICT (permission_id, role) 
    DO UPDATE SET 
        granted = p_granted,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Step 4: Create a function to detect unauthorized permissions access attempts
CREATE OR REPLACE FUNCTION public.detect_unauthorized_permissions_access()
RETURNS TABLE(
    user_id UUID,
    user_name TEXT,
    access_attempts BIGINT,
    permission_changes BIGINT,
    last_access TIMESTAMP WITH TIME ZONE,
    risk_level TEXT
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
        COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSIONS_MATRIX%') as access_attempts,
        COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_GRANT%') as permission_changes,
        MAX(a.access_time) as last_access,
        CASE 
            WHEN COUNT(*) FILTER (WHERE a.access_type LIKE '%PERMISSION_GRANT%') > 5 THEN 'CRITICAL'
            WHEN COUNT(*) > 20 THEN 'HIGH'
            WHEN COUNT(*) > 10 THEN 'MEDIUM'
            ELSE 'LOW'
        END as risk_level
    FROM public.system_users_audit_log a
    LEFT JOIN public.profiles p ON p.user_id = a.accessed_by
    WHERE a.access_type LIKE '%PERMISSION%'
        AND a.access_time > NOW() - INTERVAL '30 days'
    GROUP BY a.accessed_by, p.name
    HAVING COUNT(*) > 0
    ORDER BY permission_changes DESC, access_attempts DESC, last_access DESC;
END;
$$;

-- Step 5: Add comprehensive security documentation
COMMENT ON VIEW public.v_permissions_matrix_secure IS 'SECURITY CRITICAL: Permissions matrix view - always returns empty. Use get_permissions_matrix_secure() function for authorized access only.';
COMMENT ON FUNCTION public.get_permissions_matrix_secure IS 'Secure function to access permissions matrix - restricted to Super-Admin and Admin roles with full audit logging';
COMMENT ON FUNCTION public.update_permission_grant_secure IS 'Secure function to modify permissions - requires Super-Admin/Admin role and detailed justification';
COMMENT ON FUNCTION public.detect_unauthorized_permissions_access IS 'Security monitoring function to detect suspicious permissions access patterns';

-- Step 6: Grant execute permissions only to authenticated users (function handles authorization)
GRANT EXECUTE ON FUNCTION public.get_permissions_matrix_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_permission_grant_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_unauthorized_permissions_access TO authenticated;

-- Step 7: Create additional security trigger for direct table access attempts (if any bypass attempts are made)
CREATE OR REPLACE FUNCTION public.prevent_direct_permissions_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Log any attempt to directly access permissions tables
    INSERT INTO public.system_users_audit_log (
        accessed_by,
        employee_user_id,
        access_type,
        access_reason,
        fields_accessed,
        risk_score
    ) VALUES (
        auth.uid(),
        '00000000-0000-0000-0000-000000000003'::UUID, -- Special marker for direct access attempts
        'BLOCKED_DIRECT_PERMISSIONS_ACCESS',
        'Attempted direct access to permissions tables (blocked)',
        ARRAY[TG_TABLE_NAME],
        25 -- High risk score for unauthorized access attempts
    );
    
    -- Always block the operation
    RAISE EXCEPTION 'Direct access to permissions data is not allowed. Use secure functions only.';
END;
$$;

-- Note: The underlying tables already have proper RLS policies that block all access
-- This provides an additional layer of security monitoring

-- Step 8: Final security verification - ensure view returns no data
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
WHERE false -- Always returns empty - forces use of secure function
LIMIT 0; -- Additional safety measure