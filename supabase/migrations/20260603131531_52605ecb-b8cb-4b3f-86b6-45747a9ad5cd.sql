-- Restrict Xero OAuth credentials to Super-Admin only (was readable by Supervisors)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role = 'Super-Admin'
  );
$$;

DROP POLICY IF EXISTS "Admins can view xero connection" ON public.xero_connection;

CREATE POLICY "Super-Admins can view xero connection"
ON public.xero_connection
FOR SELECT
TO authenticated
USING (public.is_super_admin());