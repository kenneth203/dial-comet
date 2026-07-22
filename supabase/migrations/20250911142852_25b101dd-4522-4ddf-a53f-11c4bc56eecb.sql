-- Fix Security Definer View Issue
-- Remove direct access to v_permissions_matrix by updating RLS to prevent direct access

-- Add RLS policy to v_permissions_matrix table (if it's actually a table)
-- Since v_permissions_matrix is a view, we need to ensure it can only be accessed through secure functions

-- First, let's check if we can add RLS to the underlying tables
-- The view is based on app_permissions and app_permission_grants tables

-- Ensure that the view access is properly restricted by making sure
-- that the underlying tables have proper RLS policies

-- Update app_permissions table RLS if needed
DROP POLICY IF EXISTS "Direct_permissions_access_blocked" ON public.app_permissions;
CREATE POLICY "Secure_permissions_access_only" 
ON public.app_permissions 
FOR SELECT 
USING (
  -- Only allow access through secure functions or for admins
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin')
  )
);

-- Update app_permission_grants table RLS if needed  
DROP POLICY IF EXISTS "Direct_grants_access_blocked" ON public.app_permission_grants;
CREATE POLICY "Secure_grants_access_only"
ON public.app_permission_grants
FOR SELECT
USING (
  -- Only allow access through secure functions or for admins
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin')
  )
);

-- Since we can't add RLS directly to views, we ensure the underlying tables are protected
-- and the application code uses secure functions instead of direct view access

-- Also create a comment on the view to indicate it should not be accessed directly
COMMENT ON VIEW public.v_permissions_matrix IS 'SECURITY WARNING: Do not access this view directly. Use get_permissions_matrix_secure() function instead for proper access control.';

-- Optional: We could also create a more restrictive view or replace it with a function
-- But for now, the secure function approach is the recommended solution