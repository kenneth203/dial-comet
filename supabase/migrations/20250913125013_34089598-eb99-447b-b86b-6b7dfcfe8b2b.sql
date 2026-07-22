-- Create secure function to get permissions matrix data
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
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admin and super-admin access
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can view permissions matrix';
  END IF;

  -- Return the permissions matrix data
  RETURN QUERY
  SELECT 
    vpm.id,
    vpm.granted,
    vpm.grant_id,
    vpm.feature,
    vpm.icon,
    vpm.description,
    vpm.role,
    vpm.section
  FROM public.v_permissions_matrix_secure vpm;
END;
$$;

-- Drop the insecure view since we now have a secure function
DROP VIEW IF EXISTS public.v_permissions_matrix_secure;