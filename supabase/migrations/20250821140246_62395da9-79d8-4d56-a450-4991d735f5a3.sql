-- Fix security vulnerability: Remove user self-access to comprehensive_users table
-- This table contains highly sensitive HR data and should only be accessible by HR/Admin

-- Drop the policy that allows users to view their own comprehensive_users record
DROP POLICY IF EXISTS "Restricted_admin_comprehensive_users_access" ON public.comprehensive_users;

-- Create a new ultra-restrictive policy that only allows HR/Admin/Super-Admin access for SELECT
CREATE POLICY "HR_Admin_only_comprehensive_users_access" 
ON public.comprehensive_users 
FOR SELECT 
USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
));

-- Add additional security logging function for comprehensive_users modifications
CREATE OR REPLACE FUNCTION log_comprehensive_users_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Log any modification to comprehensive_users table
    INSERT INTO public.sensitive_data_audit (
        accessed_by,
        employee_id, 
        action,
        timestamp
    ) VALUES (
        auth.uid(),
        COALESCE(NEW.auth_user_id::text, OLD.auth_user_id::text),
        TG_OP || '_COMPREHENSIVE_USERS',
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for comprehensive_users modification logging (INSERT, UPDATE, DELETE only)
DROP TRIGGER IF EXISTS audit_comprehensive_users_access ON public.comprehensive_users;
CREATE TRIGGER audit_comprehensive_users_access
    AFTER INSERT OR UPDATE OR DELETE ON public.comprehensive_users
    FOR EACH ROW EXECUTE FUNCTION log_comprehensive_users_access();

-- Add a comment to document the security model
COMMENT ON TABLE public.comprehensive_users IS 'SECURITY: This table contains highly sensitive employee data including salary, personal details, and emergency contacts. Access is restricted to HR/Admin/Super-Admin roles only. Regular users must use get_my_safe_profile_data() function for basic profile access.';