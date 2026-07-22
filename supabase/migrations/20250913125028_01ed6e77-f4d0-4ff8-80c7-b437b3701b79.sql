-- Create a secure function to get permissions matrix data
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
  -- Only allow Admin, Super-Admin, and HR roles to access permissions matrix
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'HR')
    AND status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only administrators can view permissions matrix';
  END IF;

  -- Return the permissions matrix data
  RETURN QUERY
  SELECT 
    v.id,
    v.granted,
    v.grant_id,
    v.feature,
    v.icon,
    v.description,
    v.role,
    v.section
  FROM public.v_permissions_matrix_secure v
  ORDER BY v.section, v.feature, v.role;
END;
$$;