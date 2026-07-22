-- Drop the old 3-param overload that ignores scope
DROP FUNCTION IF EXISTS public.update_permission_grant(uuid, text, boolean);

-- Ensure the 4-param version exists and is correct
CREATE OR REPLACE FUNCTION public.update_permission_grant(p_permission_id uuid, p_role text, p_granted boolean, p_scope text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid() AND profiles.role = 'Super-Admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: Super-Admin role required';
  END IF;

  IF p_role = 'Super-Admin' THEN
    RAISE EXCEPTION 'Cannot modify Super-Admin permissions';
  END IF;

  -- Log the permission change with audit trail
  INSERT INTO public.system_users_audit_log (
    accessed_by, employee_user_id, access_type, access_reason,
    fields_accessed, risk_score
  ) VALUES (
    auth.uid(), auth.uid(),
    'PERMISSION_GRANT_UPDATE', 'Permission grant modified',
    ARRAY['permission_id:' || p_permission_id::text, 'role:' || p_role, 'granted:' || p_granted::text, 'scope:' || COALESCE(p_scope, 'unchanged')],
    15
  );

  UPDATE app_permission_grants
  SET granted = p_granted,
      scope = COALESCE(p_scope, scope),
      updated_at = now()
  WHERE permission_id = p_permission_id AND role = p_role;

  IF NOT FOUND THEN
    INSERT INTO app_permission_grants (permission_id, role, granted, scope)
    VALUES (p_permission_id, p_role, p_granted, COALESCE(p_scope, 'none'));
  END IF;
END;
$$;