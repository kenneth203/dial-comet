
-- 1. Prevent role/status privilege escalation on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
     AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Only administrators can change role or status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- 2. Restrict holiday_requests SELECT to admin or owner
DROP POLICY IF EXISTS holiday_req_select_auth ON public.holiday_requests;
CREATE POLICY holiday_req_select_own_or_admin
  ON public.holiday_requests FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_higher()
    OR user_id = auth.uid()
    OR system_user_id = public.get_my_system_user_id()
  );

-- 3. Restrict system_users SELECT to admin or self
DROP POLICY IF EXISTS system_users_select_auth ON public.system_users;
CREATE POLICY system_users_select_own_or_admin
  ON public.system_users FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_higher()
    OR user_id = auth.uid()
  );
