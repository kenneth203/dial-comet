
-- Create a minimal, secure staff lookup that exposes both identifiers for matching holidays
-- Only admins/supervisors will be allowed to use this
CREATE OR REPLACE FUNCTION public.get_active_staff_minimal()
RETURNS TABLE (
  auth_user_id uuid,
  system_user_id uuid,
  name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce admin or higher (matches existing security model used in Holiday features)
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    su.user_id::uuid AS auth_user_id,
    su.id AS system_user_id,
    su.name::text AS name
  FROM public.system_users su
  WHERE su.status = 'Active';
END;
$$;

-- Optionally ensure function owner is the database owner so SECURITY DEFINER executes with required privileges
-- (Lovable will run this as a superuser-equivalent migration owner)
