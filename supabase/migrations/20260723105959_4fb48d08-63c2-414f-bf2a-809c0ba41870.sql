
-- Stage 2A: Harden update_permission_grant with role-ceiling locks + structured audit

-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.permission_grant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role_snapshot text,
  actor_status_snapshot text,
  actor_name_snapshot text,
  permission_id uuid,
  section_snapshot text,
  feature_snapshot text,
  target_role text,
  outcome text NOT NULL,
  outcome_code text NOT NULL,
  outcome_message text,
  previous_granted boolean,
  previous_scope text,
  new_granted boolean,
  new_scope text,
  requested_granted boolean,
  requested_scope text
);

GRANT SELECT ON public.permission_grant_audit TO authenticated;
GRANT ALL ON public.permission_grant_audit TO service_role;

ALTER TABLE public.permission_grant_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super-Admins can read permission grant audit"
  ON public.permission_grant_audit FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- 2. Locked pair helper (immutable list; matches 38-pair ceiling)
CREATE OR REPLACE FUNCTION public.is_locked_admin_permission(p_section text, p_feature text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_section = 'database_reset'
    OR p_section = 'user_management'
    OR p_feature = 'manage_settings';
$$;

-- 3. Replace update_permission_grant with structured, hardened version
DROP FUNCTION IF EXISTS public.update_permission_grant(uuid, text, boolean, text);

CREATE OR REPLACE FUNCTION public.update_permission_grant(
  p_permission_id uuid,
  p_role text,
  p_granted boolean,
  p_scope text
)
RETURNS TABLE (
  outcome text,
  outcome_code text,
  outcome_message text,
  audit_id uuid,
  previous_granted boolean,
  previous_scope text,
  new_granted boolean,
  new_scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_status text;
  v_actor_name text;
  v_section text;
  v_feature text;
  v_prev_granted boolean;
  v_prev_scope text;
  v_new_granted boolean;
  v_new_scope text;
  v_outcome text;
  v_code text;
  v_msg text;
  v_audit_id uuid;
  v_valid_scopes text[] := ARRAY['all','team','own','assigned','none'];
  v_valid_roles text[] := ARRAY['Super-Admin','Admin','Supervisor','Operator','HR'];
BEGIN
  -- Snapshot actor
  SELECT p.role::text, p.status, p.name
    INTO v_actor_role, v_actor_status, v_actor_name
    FROM public.profiles p WHERE p.user_id = v_actor;

  -- Snapshot target permission
  SELECT ap.section, ap.feature
    INTO v_section, v_feature
    FROM public.app_permissions ap WHERE ap.id = p_permission_id;

  -- Snapshot current grant
  SELECT g.granted, g.scope
    INTO v_prev_granted, v_prev_scope
    FROM public.app_permission_grants g
    WHERE g.permission_id = p_permission_id AND g.role = p_role;

  -- Determine outcome BEFORE mutating
  IF v_actor_role IS DISTINCT FROM 'Super-Admin' OR v_actor_status IS DISTINCT FROM 'Active' THEN
    v_outcome := 'denied'; v_code := 'denied_not_super_admin';
    v_msg := 'Only active Super-Admin users may modify permission grants.';
  ELSIF v_section IS NULL THEN
    v_outcome := 'denied'; v_code := 'denied_permission_not_found';
    v_msg := 'Permission not found.';
  ELSIF NOT (p_role = ANY(v_valid_roles)) THEN
    v_outcome := 'denied'; v_code := 'denied_invalid_role';
    v_msg := 'Role not recognised.';
  ELSIF NOT (p_scope = ANY(v_valid_scopes)) THEN
    v_outcome := 'denied'; v_code := 'denied_invalid_scope';
    v_msg := 'Scope not recognised.';
  ELSIF p_role = 'Super-Admin' THEN
    v_outcome := 'denied'; v_code := 'denied_super_admin_locked';
    v_msg := 'Super-Admin grants are immutable.';
  ELSIF p_role = 'Admin' AND public.is_locked_admin_permission(v_section, v_feature) THEN
    v_outcome := 'denied'; v_code := 'denied_admin_ceiling';
    v_msg := 'This permission is locked from Admin modification (ceiling).';
  ELSIF v_prev_granted IS NOT DISTINCT FROM p_granted AND v_prev_scope IS NOT DISTINCT FROM p_scope THEN
    v_outcome := 'noop'; v_code := 'noop_unchanged';
    v_msg := 'No change.';
    v_new_granted := v_prev_granted; v_new_scope := v_prev_scope;
  ELSE
    INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
      VALUES (p_permission_id, p_role, p_granted, p_scope)
      ON CONFLICT (permission_id, role)
      DO UPDATE SET granted = EXCLUDED.granted, scope = EXCLUDED.scope, updated_at = now()
      RETURNING granted, scope INTO v_new_granted, v_new_scope;
    v_outcome := 'ok'; v_code := 'ok_updated'; v_msg := 'Grant updated.';
  END IF;

  INSERT INTO public.permission_grant_audit (
    actor_user_id, actor_role_snapshot, actor_status_snapshot, actor_name_snapshot,
    permission_id, section_snapshot, feature_snapshot, target_role,
    outcome, outcome_code, outcome_message,
    previous_granted, previous_scope, new_granted, new_scope,
    requested_granted, requested_scope
  ) VALUES (
    v_actor, v_actor_role, v_actor_status, v_actor_name,
    p_permission_id, v_section, v_feature, p_role,
    v_outcome, v_code, v_msg,
    v_prev_granted, v_prev_scope, v_new_granted, v_new_scope,
    p_granted, p_scope
  ) RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT v_outcome, v_code, v_msg, v_audit_id,
                      v_prev_granted, v_prev_scope, v_new_granted, v_new_scope;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_permission_grant(uuid, text, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_permission_grant(uuid, text, boolean, text) TO authenticated;
