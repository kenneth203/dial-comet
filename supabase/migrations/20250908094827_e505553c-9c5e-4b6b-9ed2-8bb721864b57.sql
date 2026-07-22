-- Fix security issues from the previous migration

-- Drop the existing view and recreate it without SECURITY DEFINER
DROP VIEW IF EXISTS public.v_permissions_matrix;

-- Create a regular view (not SECURITY DEFINER)
CREATE VIEW public.v_permissions_matrix AS
SELECT 
  p.id,
  p.section,
  p.feature,
  p.icon,
  p.description,
  pg.role,
  pg.granted,
  pg.id as grant_id
FROM public.app_permissions p
LEFT JOIN public.app_permission_grants pg ON p.id = pg.permission_id
ORDER BY p.section, p.feature, pg.role;

-- Fix the function to have proper search_path
CREATE OR REPLACE FUNCTION public.update_permission_grant(
  p_permission_id UUID,
  p_role TEXT,
  p_granted BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only Super-Admin and Admin can update permissions
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: Only Super-Admin and Admin can update permissions';
  END IF;

  -- Insert or update the permission grant
  INSERT INTO public.app_permission_grants (permission_id, role, granted)
  VALUES (p_permission_id, p_role, p_granted)
  ON CONFLICT (permission_id, role) 
  DO UPDATE SET 
    granted = p_granted,
    updated_at = now();

  RETURN TRUE;
END;
$$;