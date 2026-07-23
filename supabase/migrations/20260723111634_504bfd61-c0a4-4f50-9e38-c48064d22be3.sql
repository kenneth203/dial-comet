-- ============================================================
-- Stage A1 corrective migration
-- ============================================================

-- 1. Table-level privilege lockdown (A1-F1)
REVOKE ALL ON TABLE public.permission_grant_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.permission_grant_audit FROM anon;
REVOKE ALL ON TABLE public.permission_grant_audit FROM authenticated;
REVOKE ALL ON TABLE public.permission_grant_audit FROM service_role;

GRANT SELECT ON TABLE public.permission_grant_audit TO authenticated;
GRANT ALL    ON TABLE public.permission_grant_audit TO service_role;

-- 2. Replace SELECT policy with inline Active Super-Admin EXISTS check
DROP POLICY IF EXISTS "Super-Admins can read permission grant audit"
  ON public.permission_grant_audit;

CREATE POLICY "Active Super-Admins can read permission grant audit"
  ON public.permission_grant_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role   = 'Super-Admin'::public.user_role
        AND p.status = 'Active'
    )
  );

-- 6. Replace is_locked_admin_permission with explicit 38-pair VALUES list
CREATE OR REPLACE FUNCTION public.is_locked_admin_permission(
  p_section text,
  p_feature text
) RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM (VALUES
      ('call_billing','manage_settings'),
      ('chat','manage_settings'),
      ('crm_dashboard','manage_settings'),
      ('customer_directory','manage_settings'),
      ('daily_checklist','manage_settings'),
      ('daily_handover','manage_settings'),
      ('database_reset','approve'),
      ('database_reset','assign'),
      ('database_reset','create'),
      ('database_reset','delete'),
      ('database_reset','edit'),
      ('database_reset','export'),
      ('database_reset','manage_settings'),
      ('database_reset','menu_visible'),
      ('database_reset','page_access'),
      ('database_reset','view'),
      ('documents','manage_settings'),
      ('holiday_admin_panel','manage_settings'),
      ('holiday_management','manage_settings'),
      ('home_page','manage_settings'),
      ('invoice_tasks','manage_settings'),
      ('leave_types_config','manage_settings'),
      ('news','manage_settings'),
      ('noticeboard','manage_settings'),
      ('packages_pricing','manage_settings'),
      ('shift_scheduler','manage_settings'),
      ('status_reports','manage_settings'),
      ('task_manager','manage_settings'),
      ('user_management','approve'),
      ('user_management','assign'),
      ('user_management','create'),
      ('user_management','delete'),
      ('user_management','edit'),
      ('user_management','export'),
      ('user_management','manage_settings'),
      ('user_management','menu_visible'),
      ('user_management','page_access'),
      ('user_management','view')
    ) AS locked(section, feature)
    WHERE locked.section = p_section
      AND locked.feature = p_feature
  );
$function$;

-- 3 & 5. NULL-safe validation and hardened search_path on update_permission_grant
CREATE OR REPLACE FUNCTION public.update_permission_grant(
  p_permission_id uuid,
  p_role text,
  p_granted boolean,
  p_scope text
) RETURNS TABLE(
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
  SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_actor_role   text;
  v_actor_status text;
  v_actor_name   text;
  v_section      text;
  v_feature      text;
  v_prev_granted boolean;
  v_prev_scope   text;
  v_new_granted  boolean;
  v_new_scope    text;
  v_outcome      text;
  v_code         text;
  v_msg          text;
  v_audit_id     uuid;
  v_valid_scopes text[] := ARRAY['all','team','own','assigned','none'];
  v_valid_roles  text[] := ARRAY['Super-Admin','Admin','Supervisor','Operator','HR'];
BEGIN
  -- Snapshot actor
  SELECT p.role::text, p.status, p.name
    INTO v_actor_role, v_actor_status, v_actor_name
    FROM public.profiles p
   WHERE p.user_id = v_actor;

  -- Snapshot target permission (may be NULL if p_permission_id NULL or unknown)
  IF p_permission_id IS NOT NULL THEN
    SELECT ap.section, ap.feature
      INTO v_section, v_feature
      FROM public.app_permissions ap
     WHERE ap.id = p_permission_id;
  END IF;

  -- Snapshot current grant
  IF p_permission_id IS NOT NULL AND p_role IS NOT NULL THEN
    SELECT g.granted, g.scope
      INTO v_prev_granted, v_prev_scope
      FROM public.app_permission_grants g
     WHERE g.permission_id = p_permission_id AND g.role = p_role;
  END IF;

  -- Determine outcome BEFORE mutating
  IF v_actor_role IS DISTINCT FROM 'Super-Admin' OR v_actor_status IS DISTINCT FROM 'Active' THEN
    v_outcome := 'denied'; v_code := 'denied_not_super_admin';
    v_msg := 'Only active Super-Admin users may modify permission grants.';
  ELSIF p_permission_id IS NULL THEN
    v_outcome := 'denied'; v_code := 'denied_null_permission_id';
    v_msg := 'Permission id is required.';
  ELSIF p_role IS NULL OR NOT (p_role = ANY(v_valid_roles)) THEN
    v_outcome := 'denied'; v_code := 'denied_invalid_role';
    v_msg := 'Role is required and must be one of the recognised roles.';
  ELSIF p_granted IS NULL THEN
    v_outcome := 'denied'; v_code := 'denied_null_granted';
    v_msg := 'Granted flag is required.';
  ELSIF p_scope IS NULL OR NOT (p_scope = ANY(v_valid_scopes)) THEN
    v_outcome := 'denied'; v_code := 'denied_invalid_scope';
    v_msg := 'Scope is required and must be one of the recognised scopes.';
  ELSIF v_section IS NULL THEN
    v_outcome := 'denied'; v_code := 'denied_permission_not_found';
    v_msg := 'Permission not found.';
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

-- Function-level ACL: explicit — only authenticated and service_role may invoke
REVOKE ALL ON FUNCTION public.update_permission_grant(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_permission_grant(uuid, text, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_locked_admin_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_locked_admin_permission(text, text) TO authenticated, service_role;
