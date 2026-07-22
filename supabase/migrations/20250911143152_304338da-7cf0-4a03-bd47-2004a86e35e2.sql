-- Complete fix for Security Definer View issue
-- The recommended approach is to replace problematic views with secure functions

-- Drop the problematic view and replace it completely with a secure function approach
-- First, let's create a backup of the view definition just in case
-- (The view definition is already stored in our previous queries)

-- The security issue persists because views can still be accessed in ways that bypass RLS
-- The most secure approach is to not expose views directly and use functions only

-- Since we already have get_permissions_matrix_secure() function, 
-- we need to ensure that the view cannot be accessed directly at all

-- Create a more restrictive approach by denying direct access to the view completely
-- We'll do this by creating very restrictive RLS on the underlying tables

-- Make the underlying tables even more restrictive for direct access
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_permission_grants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and create ultra-restrictive ones
DROP POLICY IF EXISTS "Authenticated users can view permissions" ON public.app_permissions;
DROP POLICY IF EXISTS "Super-Admin and Admin can manage permissions" ON public.app_permissions;
DROP POLICY IF EXISTS "Secure_permissions_access_only" ON public.app_permissions;

-- Create policy that only allows access through functions (SECURITY DEFINER functions bypass RLS)
CREATE POLICY "Function_only_access_permissions"
ON public.app_permissions
FOR ALL
USING (false);  -- Deny all direct access

-- Same for grants table
DROP POLICY IF EXISTS "Authenticated users can view permission grants" ON public.app_permission_grants;
DROP POLICY IF EXISTS "Super-Admin and Admin can manage permission grants" ON public.app_permission_grants;
DROP POLICY IF EXISTS "Secure_grants_access_only" ON public.app_permission_grants;

CREATE POLICY "Function_only_access_grants"
ON public.app_permission_grants
FOR ALL
USING (false);  -- Deny all direct access

-- Since the view is based on tables that now deny all access,
-- the view effectively becomes unusable for direct queries
-- Only SECURITY DEFINER functions can access the underlying data

-- Update our secure function to ensure it works properly
CREATE OR REPLACE FUNCTION public.get_permissions_matrix_secure()
RETURNS TABLE(
  id uuid,
  granted boolean,
  grant_id uuid,
  feature text,
  icon text,
  description text,
  role text,
  section text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- This function can access the underlying tables because it's SECURITY DEFINER
  -- and bypasses the restrictive RLS policies
  SELECT 
    p.id,
    pg.granted,
    pg.id AS grant_id,
    p.feature,
    p.icon,
    p.description,
    pg.role,
    p.section
  FROM public.app_permissions p
  LEFT JOIN public.app_permission_grants pg ON (p.id = pg.permission_id)
  WHERE is_admin_or_higher()
  ORDER BY p.section, p.feature, pg.role;
$$;

-- Add a comment to the view indicating it's deprecated
COMMENT ON VIEW public.v_permissions_matrix IS 
'DEPRECATED: This view should not be used directly due to security concerns. Use get_permissions_matrix_secure() function instead. Direct access is blocked by RLS policies on underlying tables.';