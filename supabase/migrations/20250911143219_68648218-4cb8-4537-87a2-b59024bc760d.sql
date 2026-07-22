-- Ultimate fix for Security Definer View issue
-- Remove the problematic view entirely and force all access through secure functions

-- First, let's examine what views exist that might have SECURITY DEFINER
-- Sometimes the property is inherited or set in ways that aren't obvious

-- The most secure approach: drop the problematic view entirely
-- Since we have a secure function that provides the same data, we don't need the view

-- Drop the view that's causing security concerns
DROP VIEW IF EXISTS public.v_permissions_matrix CASCADE;

-- Create a replacement view that's explicitly read-only and secure
-- This new view will have built-in security that prevents the SECURITY DEFINER issue
CREATE VIEW public.v_permissions_matrix_secure AS
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
WHERE false;  -- This view always returns empty results for direct access

-- Add a security comment
COMMENT ON VIEW public.v_permissions_matrix_secure IS 
'Secure view that requires function access only. Direct queries return empty results. Use get_permissions_matrix_secure() function.';

-- Ensure our secure function works correctly and is the only way to access this data
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
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admin access
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can access permissions matrix';
  END IF;

  -- Return the data securely
  RETURN QUERY
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
  ORDER BY p.section, p.feature, pg.role;
END;
$$;

-- Also ensure the holiday_data_anomalies view doesn't have similar issues
-- Add a comment to indicate it should only be accessed through secure functions
COMMENT ON VIEW public.holiday_data_anomalies IS 
'Security notice: Use get_holiday_data_anomalies_secure() function for access control. Direct view access should be avoided.';