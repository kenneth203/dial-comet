
-- ============================================================
-- PART 2: FUNCTIONS, RLS POLICIES, TRIGGERS, SCHEMA FIXES
-- ============================================================

-- ==========================================
-- A) SCHEMA FIXES for shift_instances
-- ==========================================
ALTER TABLE public.shift_instances
  ADD COLUMN IF NOT EXISTS role_name TEXT DEFAULT 'Call Handler',
  ADD COLUMN IF NOT EXISTS color_code TEXT DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS headcount_needed INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS headcount_assigned INTEGER DEFAULT 0;

-- ==========================================
-- B) CORE SECURITY FUNCTIONS
-- ==========================================

-- get_current_user_role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- is_admin_or_higher
CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('Super-Admin', 'Supervisor')
  );
$$;

-- has_billing_access
CREATE OR REPLACE FUNCTION public.has_billing_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('Super-Admin', 'Supervisor')
  );
$$;

-- ==========================================
-- C) UPDATED_AT TRIGGER FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ==========================================
-- D) PROFILE AUTO-CREATE ON SIGNUP
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'Operator',
    'Active'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users (safe with IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;

-- ==========================================
-- E) RPC FUNCTIONS
-- ==========================================

-- get_assignable_comprehensive_users
CREATE OR REPLACE FUNCTION public.get_assignable_comprehensive_users()
RETURNS TABLE(id UUID, name TEXT, role TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cu.id, cu.name, cu.role, cu.status
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active'
  ORDER BY cu.name;
$$;

-- get_dm_candidates
CREATE OR REPLACE FUNCTION public.get_dm_candidates()
RETURNS TABLE(id UUID, name TEXT, role TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id AS id, p.name, p.role::text, p.status::text
  FROM public.profiles p
  WHERE p.user_id != auth.uid()
  AND p.status = 'Active'
  ORDER BY p.name;
$$;

-- get_active_staff_minimal
CREATE OR REPLACE FUNCTION public.get_active_staff_minimal()
RETURNS TABLE(id UUID, name TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.id, su.name, su.role
  FROM public.system_users su
  WHERE su.status = 'Active'
  ORDER BY su.name;
$$;

-- get_all_system_users_minimal
CREATE OR REPLACE FUNCTION public.get_all_system_users_minimal()
RETURNS TABLE(id UUID, name TEXT, role TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.id, su.name, su.role, su.status
  FROM public.system_users su
  ORDER BY su.name;
$$;

-- get_active_users_for_admin
CREATE OR REPLACE FUNCTION public.get_active_users_for_admin()
RETURNS TABLE(id UUID, name TEXT, role TEXT, user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.id, su.name, su.role, su.user_id
  FROM public.system_users su
  WHERE su.status = 'Active'
  ORDER BY su.name;
$$;

-- get_my_system_user_id
CREATE OR REPLACE FUNCTION public.get_my_system_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.system_users WHERE user_id = auth.uid() LIMIT 1;
$$;

-- get_my_holiday_overview
CREATE OR REPLACE FUNCTION public.get_my_holiday_overview(p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS TABLE(
  entitlement_id UUID,
  annual_leave_entitlement NUMERIC,
  annual_leave_used NUMERIC,
  sick_leave_entitlement NUMERIC,
  sick_leave_used NUMERIC,
  personal_days_entitlement NUMERIC,
  personal_days_used NUMERIC,
  carried_over NUMERIC,
  requests JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_user_id UUID;
BEGIN
  SELECT su.id INTO v_system_user_id
  FROM public.system_users su
  WHERE su.user_id = auth.uid()
  LIMIT 1;

  RETURN QUERY
  SELECT
    he.id AS entitlement_id,
    he.annual_leave_entitlement,
    he.annual_leave_used,
    he.sick_leave_entitlement,
    he.sick_leave_used,
    he.personal_days_entitlement,
    he.personal_days_used,
    he.carried_over,
    COALESCE(
      (SELECT json_agg(row_to_json(hr))
       FROM public.holiday_requests hr
       WHERE hr.user_id = auth.uid()
       AND EXTRACT(YEAR FROM hr.start_date) = p_year),
      '[]'::json
    ) AS requests
  FROM public.holiday_entitlements he
  WHERE he.user_id = COALESCE(v_system_user_id::text, auth.uid()::text)::uuid
  AND he.year = p_year;
END;
$$;

-- get_holiday_admin_overview
CREATE OR REPLACE FUNCTION public.get_holiday_admin_overview(p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  user_role TEXT,
  annual_leave_entitlement NUMERIC,
  annual_leave_used NUMERIC,
  sick_leave_used NUMERIC,
  personal_days_used NUMERIC,
  pending_requests BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    su.id AS user_id,
    su.name AS user_name,
    su.role AS user_role,
    COALESCE(he.annual_leave_entitlement, 25) AS annual_leave_entitlement,
    COALESCE(he.annual_leave_used, 0) AS annual_leave_used,
    COALESCE(he.sick_leave_used, 0) AS sick_leave_used,
    COALESCE(he.personal_days_used, 0) AS personal_days_used,
    (SELECT COUNT(*) FROM public.holiday_requests hr
     WHERE hr.user_id = su.user_id AND hr.status = 'pending') AS pending_requests
  FROM public.system_users su
  LEFT JOIN public.holiday_entitlements he ON he.user_id = su.id::text::uuid AND he.year = p_year
  WHERE su.status = 'Active'
  ORDER BY su.name;
$$;

-- upsert_leave_quota_defaults
CREATE OR REPLACE FUNCTION public.upsert_leave_quota_defaults(
  p_year INTEGER,
  p_base_annual NUMERIC DEFAULT 25.0,
  p_bank_holidays NUMERIC DEFAULT 10.0,
  p_christmas_closure_days NUMERIC DEFAULT 5.0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.leave_quota_defaults (year, base_annual, bank_holidays, christmas_closure_days)
  VALUES (p_year, p_base_annual, p_bank_holidays, p_christmas_closure_days)
  ON CONFLICT (year) DO UPDATE SET
    base_annual = p_base_annual,
    bank_holidays = p_bank_holidays,
    christmas_closure_days = p_christmas_closure_days,
    updated_at = now();
END;
$$;

-- apply_leave_quota_defaults
CREATE OR REPLACE FUNCTION public.apply_leave_quota_defaults(p_year INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults RECORD;
BEGIN
  SELECT * INTO v_defaults FROM public.leave_quota_defaults WHERE year = p_year;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No defaults found for year %', p_year;
  END IF;

  INSERT INTO public.holiday_entitlements (user_id, year, annual_leave_entitlement)
  SELECT su.id, p_year, v_defaults.base_annual
  FROM public.system_users su
  WHERE su.status = 'Active'
  ON CONFLICT (user_id, year) DO UPDATE SET
    annual_leave_entitlement = v_defaults.base_annual,
    updated_at = now();

  UPDATE public.leave_quota_defaults SET applied_at = now() WHERE year = p_year;
END;
$$;

-- generate_billing_for_period (stub)
CREATE OR REPLACE FUNCTION public.generate_billing_for_period(p_period TEXT, p_customer_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Placeholder for billing generation logic
  NULL;
END;
$$;

-- get_all_customers_secure
CREATE OR REPLACE FUNCTION public.get_all_customers_secure()
RETURNS SETOF public.customers
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.customers ORDER BY name;
$$;

-- add_customer_secure
CREATE OR REPLACE FUNCTION public.add_customer_secure(
  p_name TEXT,
  p_contact TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'Active',
  p_lead_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.customers (name, contact, email, phone, address, status, lead_metadata, user_id)
  VALUES (p_name, p_contact, p_email, p_phone, p_address, p_status, p_lead_metadata, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- update_customer_secure
CREATE OR REPLACE FUNCTION public.update_customer_secure(
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_contact TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_lead_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers SET
    name = COALESCE(p_name, name),
    contact = COALESCE(p_contact, contact),
    email = COALESCE(p_email, email),
    phone = COALESCE(p_phone, phone),
    address = COALESCE(p_address, address),
    status = COALESCE(p_status, status),
    lead_metadata = COALESCE(p_lead_metadata, lead_metadata),
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- ==========================================
-- F) RLS POLICIES
-- ==========================================

-- PROFILES
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- SYSTEM_USERS
CREATE POLICY "system_users_select_auth" ON public.system_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_users_insert_admin" ON public.system_users FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "system_users_update_admin" ON public.system_users FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "system_users_delete_admin" ON public.system_users FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- COMPREHENSIVE_USERS
CREATE POLICY "comp_users_select_auth" ON public.comprehensive_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "comp_users_insert_admin" ON public.comprehensive_users FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "comp_users_update_admin" ON public.comprehensive_users FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "comp_users_delete_admin" ON public.comprehensive_users FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- STAFF_DETAILS
CREATE POLICY "staff_details_select_admin" ON public.staff_details FOR SELECT TO authenticated USING (public.is_admin_or_higher() OR user_id = auth.uid());
CREATE POLICY "staff_details_insert_admin" ON public.staff_details FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "staff_details_update_admin" ON public.staff_details FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- CUSTOMERS
CREATE POLICY "customers_select_auth" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_insert_auth" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customers_update_auth" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "customers_delete_admin" ON public.customers FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- PROJECT_TASKS
CREATE POLICY "tasks_select_auth" ON public.project_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert_auth" ON public.project_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tasks_update_auth" ON public.project_tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tasks_delete_owner" ON public.project_tasks FOR DELETE TO authenticated USING (created_by = auth.uid());

-- NEWS_ITEMS
CREATE POLICY "news_select_auth" ON public.news_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "news_insert_auth" ON public.news_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "news_update_owner" ON public.news_items FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "news_delete_owner" ON public.news_items FOR DELETE TO authenticated USING (user_id = auth.uid());

-- NOTICEBOARD
CREATE POLICY "noticeboard_select_auth" ON public.noticeboard FOR SELECT TO authenticated USING (true);
CREATE POLICY "noticeboard_insert_admin" ON public.noticeboard FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "noticeboard_update_admin" ON public.noticeboard FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- TODOS
CREATE POLICY "todos_select_auth" ON public.todos FOR SELECT TO authenticated USING (true);
CREATE POLICY "todos_insert_auth" ON public.todos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "todos_update_own" ON public.todos FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "todos_delete_own" ON public.todos FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- HOLIDAY_REQUESTS
CREATE POLICY "holiday_req_select_auth" ON public.holiday_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "holiday_req_insert_auth" ON public.holiday_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "holiday_req_update_admin" ON public.holiday_requests FOR UPDATE TO authenticated USING (public.is_admin_or_higher() OR user_id = auth.uid());
CREATE POLICY "holiday_req_delete_admin" ON public.holiday_requests FOR DELETE TO authenticated USING (public.is_admin_or_higher() OR user_id = auth.uid());

-- HOLIDAY_ENTITLEMENTS
CREATE POLICY "holiday_ent_select_auth" ON public.holiday_entitlements FOR SELECT TO authenticated USING (true);
CREATE POLICY "holiday_ent_insert_admin" ON public.holiday_entitlements FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "holiday_ent_update_admin" ON public.holiday_entitlements FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- LEAVE_QUOTA_DEFAULTS
CREATE POLICY "leave_quota_select_admin" ON public.leave_quota_defaults FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "leave_quota_insert_admin" ON public.leave_quota_defaults FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "leave_quota_update_admin" ON public.leave_quota_defaults FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- CHAT_ROOMS
CREATE POLICY "chat_rooms_select_member" ON public.chat_rooms FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.chat_room_members crm WHERE crm.room_id = id AND crm.user_id = auth.uid())
);
CREATE POLICY "chat_rooms_insert_auth" ON public.chat_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- CHAT_ROOM_MEMBERS
CREATE POLICY "chat_members_select_auth" ON public.chat_room_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_members_insert_auth" ON public.chat_room_members FOR INSERT TO authenticated WITH CHECK (true);

-- CHAT_MESSAGES
CREATE POLICY "chat_msg_select_member" ON public.chat_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.chat_room_members crm WHERE crm.room_id = room_id AND crm.user_id = auth.uid())
);
CREATE POLICY "chat_msg_insert_member" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (SELECT 1 FROM public.chat_room_members crm WHERE crm.room_id = room_id AND crm.user_id = auth.uid())
);

-- CHAT_MESSAGE_READS
CREATE POLICY "chat_reads_select_own" ON public.chat_message_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "chat_reads_insert_own" ON public.chat_message_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- BILLING_CUSTOMERS
CREATE POLICY "billing_cust_select_auth" ON public.billing_customers FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "billing_cust_insert_admin" ON public.billing_customers FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "billing_cust_update_admin" ON public.billing_customers FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "billing_cust_delete_admin" ON public.billing_customers FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- BILLING_INVOICES
CREATE POLICY "billing_inv_select_admin" ON public.billing_invoices FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "billing_inv_insert_admin" ON public.billing_invoices FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "billing_inv_update_admin" ON public.billing_invoices FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- BILLING_SETTINGS
CREATE POLICY "billing_set_select_admin" ON public.billing_settings FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "billing_set_update_admin" ON public.billing_settings FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- BILLING_LINE_ITEMS
CREATE POLICY "billing_li_select_admin" ON public.billing_line_items FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "billing_li_insert_admin" ON public.billing_line_items FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());

-- BILLING_PERIODS
CREATE POLICY "billing_per_select_admin" ON public.billing_periods FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "billing_per_insert_admin" ON public.billing_periods FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "billing_per_update_admin" ON public.billing_periods FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- CALL_LOGS
CREATE POLICY "call_logs_select_admin" ON public.call_logs FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "call_logs_insert_admin" ON public.call_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "call_logs_update_admin" ON public.call_logs FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "call_logs_delete_admin" ON public.call_logs FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- IMPORT_BATCHES
CREATE POLICY "import_batch_select_admin" ON public.import_batches FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "import_batch_insert_admin" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "import_batch_update_admin" ON public.import_batches FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- CUSTOMER_PRICING
CREATE POLICY "cust_pricing_select_admin" ON public.customer_pricing FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "cust_pricing_insert_admin" ON public.customer_pricing FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "cust_pricing_update_admin" ON public.customer_pricing FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- SHIFT_INSTANCES
CREATE POLICY "shift_inst_select_auth" ON public.shift_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_inst_insert_admin" ON public.shift_instances FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "shift_inst_update_admin" ON public.shift_instances FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "shift_inst_delete_admin" ON public.shift_instances FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- SHIFT_TEMPLATES
CREATE POLICY "shift_tmpl_select_auth" ON public.shift_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_tmpl_insert_admin" ON public.shift_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "shift_tmpl_update_admin" ON public.shift_templates FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "shift_tmpl_delete_admin" ON public.shift_templates FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- SHIFT_ASSIGNMENTS
CREATE POLICY "shift_assign_select_auth" ON public.shift_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_assign_insert_admin" ON public.shift_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "shift_assign_update_admin" ON public.shift_assignments FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "shift_assign_delete_admin" ON public.shift_assignments FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- SHIFT_AUDIT_LOG
CREATE POLICY "shift_audit_select_admin" ON public.shift_audit_log FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "shift_audit_insert_auth" ON public.shift_audit_log FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());

-- SCHEDULER_SETTINGS
CREATE POLICY "sched_set_select_auth" ON public.scheduler_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "sched_set_insert_admin" ON public.scheduler_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "sched_set_update_admin" ON public.scheduler_settings FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- USER_SKILLS
CREATE POLICY "user_skills_select_auth" ON public.user_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_skills_insert_admin" ON public.user_skills FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "user_skills_update_admin" ON public.user_skills FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "user_skills_delete_admin" ON public.user_skills FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- USER_STATUS
CREATE POLICY "user_status_select_auth" ON public.user_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_status_insert_own" ON public.user_status FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_status_update_own" ON public.user_status FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- USER_STATUSES
CREATE POLICY "user_statuses_select_auth" ON public.user_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_statuses_insert_own" ON public.user_statuses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_statuses_update_own" ON public.user_statuses FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- STATUS_TIMING_LOGS
CREATE POLICY "status_logs_select_auth" ON public.status_timing_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "status_logs_insert_own" ON public.status_timing_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- FORM_TEMPLATES
CREATE POLICY "form_tmpl_select_auth" ON public.form_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_tmpl_select_anon" ON public.form_templates FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "form_tmpl_insert_auth" ON public.form_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "form_tmpl_update_owner" ON public.form_templates FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "form_tmpl_delete_owner" ON public.form_templates FOR DELETE TO authenticated USING (created_by = auth.uid());

-- FORM_SUBMISSIONS
CREATE POLICY "form_sub_select_auth" ON public.form_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_sub_insert_anon" ON public.form_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "form_sub_insert_auth" ON public.form_submissions FOR INSERT TO authenticated WITH CHECK (true);

-- DOCUMENT_SHARES
CREATE POLICY "doc_shares_select_auth" ON public.document_shares FOR SELECT TO authenticated USING (shared_by = auth.uid() OR public.is_admin_or_higher());
CREATE POLICY "doc_shares_insert_auth" ON public.document_shares FOR INSERT TO authenticated WITH CHECK (shared_by = auth.uid());
CREATE POLICY "doc_shares_update_owner" ON public.document_shares FOR UPDATE TO authenticated USING (shared_by = auth.uid());

-- PROPOSAL_TOKENS
CREATE POLICY "proposal_select_auth" ON public.proposal_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "proposal_select_anon" ON public.proposal_tokens FOR SELECT TO anon USING (true);
CREATE POLICY "proposal_insert_auth" ON public.proposal_tokens FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "proposal_update_anon" ON public.proposal_tokens FOR UPDATE TO anon USING (true);
CREATE POLICY "proposal_update_auth" ON public.proposal_tokens FOR UPDATE TO authenticated USING (true);

-- TASK_ATTACHMENTS
CREATE POLICY "task_att_select_auth" ON public.task_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "task_att_insert_auth" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "task_att_delete_owner" ON public.task_attachments FOR DELETE TO authenticated USING (uploaded_by = auth.uid());

-- TASK_NOTIFICATIONS
CREATE POLICY "task_notif_select_own" ON public.task_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "task_notif_insert_auth" ON public.task_notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "task_notif_update_own" ON public.task_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- EMPLOYEE_FINANCIAL_DATA
CREATE POLICY "emp_fin_select_admin" ON public.employee_financial_data FOR SELECT TO authenticated USING (public.is_admin_or_higher() OR user_id = auth.uid());
CREATE POLICY "emp_fin_insert_admin" ON public.employee_financial_data FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "emp_fin_update_admin" ON public.employee_financial_data FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- EMPLOYEE_SENSITIVE_DATA
CREATE POLICY "emp_sens_select_admin" ON public.employee_sensitive_data FOR SELECT TO authenticated USING (public.is_admin_or_higher() OR user_id = auth.uid());
CREATE POLICY "emp_sens_insert_admin" ON public.employee_sensitive_data FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "emp_sens_update_admin" ON public.employee_sensitive_data FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- FINANCIAL_EMERGENCY_ACCESS
CREATE POLICY "fin_emerg_select_admin" ON public.financial_emergency_access FOR SELECT TO authenticated USING (public.is_admin_or_higher() OR user_id = auth.uid());
CREATE POLICY "fin_emerg_insert_admin" ON public.financial_emergency_access FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "fin_emerg_update_admin" ON public.financial_emergency_access FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- AUDIT TABLES (insert-only for authenticated)
CREATE POLICY "billing_audit_insert" ON public.billing_data_audit FOR INSERT TO authenticated WITH CHECK (accessed_by = auth.uid());
CREATE POLICY "billing_audit_select_admin" ON public.billing_data_audit FOR SELECT TO authenticated USING (public.is_admin_or_higher());

CREATE POLICY "staff_audit_insert" ON public.staff_data_access_audit FOR INSERT TO authenticated WITH CHECK (accessed_by = auth.uid());
CREATE POLICY "staff_audit_select_admin" ON public.staff_data_access_audit FOR SELECT TO authenticated USING (public.is_admin_or_higher());

CREATE POLICY "sens_audit_insert" ON public.sensitive_data_audit FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "sens_audit_select_admin" ON public.sensitive_data_audit FOR SELECT TO authenticated USING (public.is_admin_or_higher());

CREATE POLICY "sens_log_insert" ON public.sensitive_data_access_log FOR INSERT TO authenticated WITH CHECK (accessed_by = auth.uid());
CREATE POLICY "sens_log_select_admin" ON public.sensitive_data_access_log FOR SELECT TO authenticated USING (public.is_admin_or_higher());

CREATE POLICY "fin_audit_insert" ON public.financial_data_audit_enhanced FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "fin_audit_select_admin" ON public.financial_data_audit_enhanced FOR SELECT TO authenticated USING (public.is_admin_or_higher());

CREATE POLICY "sys_users_audit_insert" ON public.system_users_audit_log FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());
CREATE POLICY "sys_users_audit_select_admin" ON public.system_users_audit_log FOR SELECT TO authenticated USING (public.is_admin_or_higher());

-- APP_PERMISSIONS
CREATE POLICY "app_perm_select_auth" ON public.app_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_perm_insert_admin" ON public.app_permissions FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "app_perm_update_admin" ON public.app_permissions FOR UPDATE TO authenticated USING (public.is_admin_or_higher());

-- APP_PERMISSION_GRANTS
CREATE POLICY "app_grant_select_auth" ON public.app_permission_grants FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_grant_insert_admin" ON public.app_permission_grants FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "app_grant_update_admin" ON public.app_permission_grants FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "app_grant_delete_admin" ON public.app_permission_grants FOR DELETE TO authenticated USING (public.is_admin_or_higher());

-- ==========================================
-- G) UPDATED_AT TRIGGERS
-- ==========================================
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_system_users_updated_at BEFORE UPDATE ON public.system_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_comprehensive_users_updated_at BEFORE UPDATE ON public.comprehensive_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_staff_details_updated_at BEFORE UPDATE ON public.staff_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_holiday_entitlements_updated_at BEFORE UPDATE ON public.holiday_entitlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_holiday_requests_updated_at BEFORE UPDATE ON public.holiday_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shift_instances_updated_at BEFORE UPDATE ON public.shift_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_shift_assignments_updated_at BEFORE UPDATE ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_noticeboard_updated_at BEFORE UPDATE ON public.noticeboard FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_news_items_updated_at BEFORE UPDATE ON public.news_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- H) UNIQUE CONSTRAINT for holiday_entitlements
-- ==========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'holiday_entitlements_user_id_year_key'
  ) THEN
    ALTER TABLE public.holiday_entitlements ADD CONSTRAINT holiday_entitlements_user_id_year_key UNIQUE (user_id, year);
  END IF;
END;
$$;

-- UNIQUE constraint for leave_quota_defaults
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_quota_defaults_pkey'
  ) THEN
    ALTER TABLE public.leave_quota_defaults ADD CONSTRAINT leave_quota_defaults_year_unique UNIQUE (year);
  END IF;
END;
$$;
