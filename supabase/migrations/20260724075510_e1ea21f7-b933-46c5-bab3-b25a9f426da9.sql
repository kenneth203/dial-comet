
-- =====================================================================
-- 1. TIGHTEN OVERLY BROAD SELECT POLICIES
-- =====================================================================

-- checklist_instances: restrict to owner + admins
DROP POLICY IF EXISTS checklist_instances_select_all ON public.checklist_instances;
CREATE POLICY checklist_instances_select_scoped ON public.checklist_instances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_higher());

-- customers: require active staff or admin (still broad enough for normal use)
DROP POLICY IF EXISTS customers_select_auth ON public.customers;
CREATE POLICY customers_select_scoped ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_higher()
    OR (
      status <> 'Lead'
      AND EXISTS (
        SELECT 1 FROM public.system_users su
        WHERE su.user_id = auth.uid() AND su.status = 'Active'
      )
    )
    OR user_id = auth.uid()
  );

-- project_tasks: restrict to involved parties + admins
DROP POLICY IF EXISTS tasks_select_all_auth ON public.project_tasks;
CREATE POLICY tasks_select_scoped ON public.project_tasks
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_higher()
    OR created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR (auth.uid())::text = ANY (string_to_array(COALESCE(assignee_id, ''), ','))
    OR EXISTS (
      SELECT 1 FROM public.system_users su
      WHERE su.user_id = auth.uid()
        AND (su.id)::text = ANY (string_to_array(COALESCE(project_tasks.assignee_id, ''), ','))
    )
  );

-- todos: restrict to owner, assignee, mentions, admins
DROP POLICY IF EXISTS todos_select_all_auth ON public.todos;
CREATE POLICY todos_select_scoped ON public.todos
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_higher()
    OR user_id = auth.uid()
    OR (auth.uid())::text = ANY (string_to_array(COALESCE(assignee_id, ''), ','))
    OR (auth.uid())::text = ANY (COALESCE(mentioned_users, ARRAY[]::text[]))
    OR EXISTS (
      SELECT 1 FROM public.system_users su
      WHERE su.user_id = auth.uid()
        AND (su.id)::text = ANY (string_to_array(COALESCE(todos.assignee_id, ''), ','))
    )
  );

-- shift_instances: require active staff (removes bare true)
DROP POLICY IF EXISTS shift_inst_select_auth ON public.shift_instances;
CREATE POLICY shift_inst_select_scoped ON public.shift_instances
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_higher()
    OR EXISTS (
      SELECT 1 FROM public.system_users su
      WHERE su.user_id = auth.uid() AND su.status = 'Active'
    )
  );

-- =====================================================================
-- 2. HARDEN profiles UPDATE — remove fragile self-referential check
-- =====================================================================
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own_safe ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- Note: the existing trigger prevent_profile_role_self_change (and
-- prevent_profile_role_escalation) block role/status changes on self-update.
-- Admin path (profiles_admin_update_any) remains for legitimate elevation.

-- =====================================================================
-- 3. REPLACE PERMISSIVE "true" INSERT/UPDATE WITH_CHECK POLICIES
-- =====================================================================

-- customers insert
DROP POLICY IF EXISTS customers_insert_auth ON public.customers;
CREATE POLICY customers_insert_auth ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- customer_accounts insert
DROP POLICY IF EXISTS cust_accounts_insert_auth ON public.customer_accounts;
CREATE POLICY cust_accounts_insert_auth ON public.customer_accounts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- project_tasks insert
DROP POLICY IF EXISTS tasks_insert_auth ON public.project_tasks;
CREATE POLICY tasks_insert_auth ON public.project_tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));

-- form_submissions insert (public form submissions may be anon — keep permissive but scoped role)
DROP POLICY IF EXISTS form_sub_insert_auth ON public.form_submissions;
CREATE POLICY form_sub_insert_scoped ON public.form_submissions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
-- (Public forms are intentionally submittable by anon; the anon role gate is
-- explicit here so the policy no longer relies on a bare TRUE across all roles.)

-- form_templates insert
DROP POLICY IF EXISTS form_tmpl_insert_auth ON public.form_templates;
CREATE POLICY form_tmpl_insert_auth ON public.form_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- news_items insert
DROP POLICY IF EXISTS news_insert_auth ON public.news_items;
CREATE POLICY news_insert_auth ON public.news_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Service-role only policies: pin to service_role so bare TRUE is not a risk
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can update send log" ON public.email_send_log
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails
  FOR INSERT TO service_role WITH CHECK (true);

-- =====================================================================
-- 4. REVOKE anon EXECUTE ON ALL SECURITY DEFINER FUNCTIONS IN public
-- =====================================================================
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', fn.sig);
  END LOOP;
END $$;
