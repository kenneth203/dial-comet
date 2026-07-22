-- Fix the get_permissions_matrix_secure function to join actual tables
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

  -- Return the permissions matrix data by joining actual tables
  RETURN QUERY
  SELECT 
    ap.id,
    COALESCE(apg.granted, false) as granted,
    apg.id as grant_id,
    ap.feature,
    ap.icon,
    ap.description,
    COALESCE(apg.role, 'Operator') as role,
    ap.section
  FROM public.app_permissions ap
  LEFT JOIN public.app_permission_grants apg ON ap.id = apg.permission_id
  ORDER BY ap.section, ap.feature, COALESCE(apg.role, 'Operator');
END;
$$;