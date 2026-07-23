
-- =====================================================================
-- PHASE 1B STAGE 1
--   A. Restore app permission catalogue (idempotent UPSERT, no DELETE)
--   B. Atomic profiles.role sync in admin_create_system_user /
--      admin_update_system_user, with role validation and profile-exists
--      guards. No Manager grants, no HR grants, no schema changes.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A1. Canonical 19-section catalogue (190 rows). ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------
INSERT INTO public.app_permissions (section, feature, icon, description) VALUES
('home_page', 'menu_visible', 'LayoutDashboard', 'Home page menu visibility'),
('home_page', 'page_access', 'LayoutDashboard', 'Home page access'),
('home_page', 'view', 'Eye', 'View home page data'),
('home_page', 'create', 'Plus', 'Create on home page'),
('home_page', 'edit', 'Edit', 'Edit home page content'),
('home_page', 'delete', 'Trash2', 'Delete on home page'),
('home_page', 'assign', 'UserCheck', 'Assign from home page'),
('home_page', 'approve', 'Check', 'Approve from home page'),
('home_page', 'export', 'FileText', 'Export from home page'),
('home_page', 'manage_settings', 'Settings', 'Manage home page settings'),
('daily_handover', 'menu_visible', 'Clock', 'Daily handover menu visibility'),
('daily_handover', 'page_access', 'Clock', 'Daily handover page access'),
('daily_handover', 'view', 'Eye', 'View handover data'),
('daily_handover', 'create', 'Plus', 'Create handover entries'),
('daily_handover', 'edit', 'Edit', 'Edit handover entries'),
('daily_handover', 'delete', 'Trash2', 'Delete handover entries'),
('daily_handover', 'assign', 'UserCheck', 'Assign handover items'),
('daily_handover', 'approve', 'Check', 'Approve handover items'),
('daily_handover', 'export', 'FileText', 'Export handover data'),
('daily_handover', 'manage_settings', 'Settings', 'Manage handover settings'),
('task_manager', 'menu_visible', 'UserCheck', 'Task manager menu visibility'),
('task_manager', 'page_access', 'UserCheck', 'Task manager page access'),
('task_manager', 'view', 'Eye', 'View tasks'),
('task_manager', 'create', 'Plus', 'Create tasks'),
('task_manager', 'edit', 'Edit', 'Edit tasks'),
('task_manager', 'delete', 'Trash2', 'Delete tasks'),
('task_manager', 'assign', 'UserCheck', 'Assign tasks'),
('task_manager', 'approve', 'Check', 'Approve tasks'),
('task_manager', 'export', 'FileText', 'Export tasks'),
('task_manager', 'manage_settings', 'Settings', 'Manage task settings'),
('noticeboard', 'menu_visible', 'MessageCircle', 'Noticeboard menu visibility'),
('noticeboard', 'page_access', 'MessageCircle', 'Noticeboard page access'),
('noticeboard', 'view', 'Eye', 'View noticeboard'),
('noticeboard', 'create', 'Plus', 'Create notices'),
('noticeboard', 'edit', 'Edit', 'Edit notices'),
('noticeboard', 'delete', 'Trash2', 'Delete notices'),
('noticeboard', 'assign', 'UserCheck', 'Assign notices'),
('noticeboard', 'approve', 'Check', 'Approve notices'),
('noticeboard', 'export', 'FileText', 'Export notices'),
('noticeboard', 'manage_settings', 'Settings', 'Manage noticeboard settings'),
('news', 'menu_visible', 'FileText', 'News menu visibility'),
('news', 'page_access', 'FileText', 'News page access'),
('news', 'view', 'Eye', 'View news'),
('news', 'create', 'Plus', 'Create news'),
('news', 'edit', 'Edit', 'Edit news'),
('news', 'delete', 'Trash2', 'Delete news'),
('news', 'assign', 'UserCheck', 'Assign news'),
('news', 'approve', 'Check', 'Approve news'),
('news', 'export', 'FileText', 'Export news'),
('news', 'manage_settings', 'Settings', 'Manage news settings'),
('customer_directory', 'menu_visible', 'Building', 'Customer directory menu visibility'),
('customer_directory', 'page_access', 'Building', 'Customer directory page access'),
('customer_directory', 'view', 'Eye', 'View customers'),
('customer_directory', 'create', 'Plus', 'Create customers'),
('customer_directory', 'edit', 'Edit', 'Edit customers'),
('customer_directory', 'delete', 'Trash2', 'Delete customers'),
('customer_directory', 'assign', 'UserCheck', 'Assign customers'),
('customer_directory', 'approve', 'Check', 'Approve customer changes'),
('customer_directory', 'export', 'FileText', 'Export customer data'),
('customer_directory', 'manage_settings', 'Settings', 'Manage customer settings'),
('crm_dashboard', 'menu_visible', 'BarChart3', 'CRM menu visibility'),
('crm_dashboard', 'page_access', 'BarChart3', 'CRM page access'),
('crm_dashboard', 'view', 'Eye', 'View CRM data'),
('crm_dashboard', 'create', 'Plus', 'Create CRM entries'),
('crm_dashboard', 'edit', 'Edit', 'Edit CRM entries'),
('crm_dashboard', 'delete', 'Trash2', 'Delete CRM entries'),
('crm_dashboard', 'assign', 'UserCheck', 'Assign CRM items'),
('crm_dashboard', 'approve', 'Check', 'Approve CRM actions'),
('crm_dashboard', 'export', 'FileText', 'Export CRM data'),
('crm_dashboard', 'manage_settings', 'Settings', 'Manage CRM settings'),
('call_billing', 'menu_visible', 'Phone', 'Call billing menu visibility'),
('call_billing', 'page_access', 'Phone', 'Call billing page access'),
('call_billing', 'view', 'Eye', 'View billing data'),
('call_billing', 'create', 'Plus', 'Create billing entries'),
('call_billing', 'edit', 'Edit', 'Edit billing entries'),
('call_billing', 'delete', 'Trash2', 'Delete billing entries'),
('call_billing', 'assign', 'UserCheck', 'Assign billing items'),
('call_billing', 'approve', 'Check', 'Approve billing'),
('call_billing', 'export', 'FileText', 'Export billing data'),
('call_billing', 'manage_settings', 'Settings', 'Manage billing settings'),
('shift_scheduler', 'menu_visible', 'Calendar', 'Shift scheduler menu visibility'),
('shift_scheduler', 'page_access', 'Calendar', 'Shift scheduler page access'),
('shift_scheduler', 'view', 'Eye', 'View shifts'),
('shift_scheduler', 'create', 'Plus', 'Create shifts'),
('shift_scheduler', 'edit', 'Edit', 'Edit shifts'),
('shift_scheduler', 'delete', 'Trash2', 'Delete shifts'),
('shift_scheduler', 'assign', 'UserCheck', 'Assign shifts'),
('shift_scheduler', 'approve', 'Check', 'Approve shift changes'),
('shift_scheduler', 'export', 'FileText', 'Export shift data'),
('shift_scheduler', 'manage_settings', 'Settings', 'Manage shift settings'),
('user_management', 'menu_visible', 'Users', 'User management menu visibility'),
('user_management', 'page_access', 'Users', 'User management page access'),
('user_management', 'view', 'Eye', 'View users'),
('user_management', 'create', 'Plus', 'Create users'),
('user_management', 'edit', 'Edit', 'Edit users'),
('user_management', 'delete', 'Trash2', 'Delete users'),
('user_management', 'assign', 'UserCheck', 'Assign user roles'),
('user_management', 'approve', 'Check', 'Approve user changes'),
('user_management', 'export', 'FileText', 'Export user data'),
('user_management', 'manage_settings', 'Settings', 'Manage user settings'),
('holiday_management', 'menu_visible', 'Calendar', 'Holiday management menu visibility'),
('holiday_management', 'page_access', 'Calendar', 'Holiday management page access'),
('holiday_management', 'view', 'Eye', 'View holidays'),
('holiday_management', 'create', 'Plus', 'Create holiday requests'),
('holiday_management', 'edit', 'Edit', 'Edit holiday requests'),
('holiday_management', 'delete', 'Trash2', 'Delete holiday requests'),
('holiday_management', 'assign', 'UserCheck', 'Assign holidays'),
('holiday_management', 'approve', 'Check', 'Approve holiday requests'),
('holiday_management', 'export', 'FileText', 'Export holiday data'),
('holiday_management', 'manage_settings', 'Settings', 'Manage holiday settings'),
('holiday_admin_panel', 'menu_visible', 'Calendar', 'Holiday admin menu visibility'),
('holiday_admin_panel', 'page_access', 'Calendar', 'Holiday admin page access'),
('holiday_admin_panel', 'view', 'Eye', 'View holiday admin data'),
('holiday_admin_panel', 'create', 'Plus', 'Create in holiday admin'),
('holiday_admin_panel', 'edit', 'Edit', 'Edit in holiday admin'),
('holiday_admin_panel', 'delete', 'Trash2', 'Delete in holiday admin'),
('holiday_admin_panel', 'assign', 'UserCheck', 'Assign in holiday admin'),
('holiday_admin_panel', 'approve', 'Check', 'Approve in holiday admin'),
('holiday_admin_panel', 'export', 'FileText', 'Export holiday admin data'),
('holiday_admin_panel', 'manage_settings', 'Settings', 'Manage holiday admin settings'),
('leave_types_config', 'menu_visible', 'Settings', 'Leave types menu visibility'),
('leave_types_config', 'page_access', 'Settings', 'Leave types page access'),
('leave_types_config', 'view', 'Eye', 'View leave types'),
('leave_types_config', 'create', 'Plus', 'Create leave types'),
('leave_types_config', 'edit', 'Edit', 'Edit leave types'),
('leave_types_config', 'delete', 'Trash2', 'Delete leave types'),
('leave_types_config', 'assign', 'UserCheck', 'Assign leave types'),
('leave_types_config', 'approve', 'Check', 'Approve leave type changes'),
('leave_types_config', 'export', 'FileText', 'Export leave type data'),
('leave_types_config', 'manage_settings', 'Settings', 'Manage leave type settings'),
('packages_pricing', 'menu_visible', 'Package', 'Packages menu visibility'),
('packages_pricing', 'page_access', 'Package', 'Packages page access'),
('packages_pricing', 'view', 'Eye', 'View packages'),
('packages_pricing', 'create', 'Plus', 'Create packages'),
('packages_pricing', 'edit', 'Edit', 'Edit packages'),
('packages_pricing', 'delete', 'Trash2', 'Delete packages'),
('packages_pricing', 'assign', 'UserCheck', 'Assign packages'),
('packages_pricing', 'approve', 'Check', 'Approve package changes'),
('packages_pricing', 'export', 'FileText', 'Export package data'),
('packages_pricing', 'manage_settings', 'Settings', 'Manage package settings'),
('status_reports', 'menu_visible', 'BarChart3', 'Reports menu visibility'),
('status_reports', 'page_access', 'BarChart3', 'Reports page access'),
('status_reports', 'view', 'Eye', 'View reports'),
('status_reports', 'create', 'Plus', 'Create reports'),
('status_reports', 'edit', 'Edit', 'Edit reports'),
('status_reports', 'delete', 'Trash2', 'Delete reports'),
('status_reports', 'assign', 'UserCheck', 'Assign reports'),
('status_reports', 'approve', 'Check', 'Approve reports'),
('status_reports', 'export', 'FileText', 'Export reports'),
('status_reports', 'manage_settings', 'Settings', 'Manage report settings'),
('invoice_tasks', 'menu_visible', 'CreditCard', 'Invoice tasks menu visibility'),
('invoice_tasks', 'page_access', 'CreditCard', 'Invoice tasks page access'),
('invoice_tasks', 'view', 'Eye', 'View invoice tasks'),
('invoice_tasks', 'create', 'Plus', 'Create invoice tasks'),
('invoice_tasks', 'edit', 'Edit', 'Edit invoice tasks'),
('invoice_tasks', 'delete', 'Trash2', 'Delete invoice tasks'),
('invoice_tasks', 'assign', 'UserCheck', 'Assign invoice tasks'),
('invoice_tasks', 'approve', 'Check', 'Approve invoice tasks'),
('invoice_tasks', 'export', 'FileText', 'Export invoice task data'),
('invoice_tasks', 'manage_settings', 'Settings', 'Manage invoice task settings'),
('chat', 'menu_visible', 'MessageCircle', 'Chat menu visibility'),
('chat', 'page_access', 'MessageCircle', 'Chat page access'),
('chat', 'view', 'Eye', 'View chat messages'),
('chat', 'create', 'Plus', 'Create chat messages'),
('chat', 'edit', 'Edit', 'Edit chat messages'),
('chat', 'delete', 'Trash2', 'Delete chat messages'),
('chat', 'assign', 'UserCheck', 'Assign chat rooms'),
('chat', 'approve', 'Check', 'Approve chat actions'),
('chat', 'export', 'FileText', 'Export chat data'),
('chat', 'manage_settings', 'Settings', 'Manage chat settings'),
('documents', 'menu_visible', 'FileText', 'Documents menu visibility'),
('documents', 'page_access', 'FileText', 'Documents page access'),
('documents', 'view', 'Eye', 'View documents'),
('documents', 'create', 'Plus', 'Upload documents'),
('documents', 'edit', 'Edit', 'Edit documents'),
('documents', 'delete', 'Trash2', 'Delete documents'),
('documents', 'assign', 'UserCheck', 'Assign documents'),
('documents', 'approve', 'Check', 'Approve document actions'),
('documents', 'export', 'FileText', 'Download documents'),
('documents', 'manage_settings', 'Settings', 'Manage document settings'),
('database_reset', 'menu_visible', 'Database', 'Database reset menu visibility'),
('database_reset', 'page_access', 'Database', 'Database reset page access'),
('database_reset', 'view', 'Eye', 'View database reset'),
('database_reset', 'create', 'Plus', 'Create in database reset'),
('database_reset', 'edit', 'Edit', 'Edit in database reset'),
('database_reset', 'delete', 'Trash2', 'Execute database reset'),
('database_reset', 'assign', 'UserCheck', 'Assign database reset'),
('database_reset', 'approve', 'Check', 'Approve database reset'),
('database_reset', 'export', 'FileText', 'Export database data'),
('database_reset', 'manage_settings', 'Settings', 'Manage database reset settings')
ON CONFLICT (section, feature) DO NOTHING;

-- A2. Supplementary rows added after canonical seed.
INSERT INTO public.app_permissions (section, feature, icon, description) VALUES
('task_manager', 'view_billing_data', 'CreditCard', 'View cost, billable time and total time on tasks'),
('customer_directory', 'script_view', 'FileText', 'View customer call script'),
('customer_directory', 'script_edit', 'Pencil', 'Edit customer call script'),
('customer_directory', 'contact_ooo_edit', 'CalendarOff', 'Set or clear Out of Office on a customer contact from the inbound call script')
ON CONFLICT (section, feature) DO NOTHING;

-- A3. Daily checklist section (7 rows).
INSERT INTO public.app_permissions (section, feature, description) VALUES
('daily_checklist','menu_visible','Show Daily Checklist Templates in navigation'),
('daily_checklist','page_access','Open Daily Checklist Templates page'),
('daily_checklist','view','View checklist templates and reports'),
('daily_checklist','create','Create checklist templates'),
('daily_checklist','edit','Edit checklist templates'),
('daily_checklist','delete','Delete checklist templates'),
('daily_checklist','manage_settings','Manage checklist settings')
ON CONFLICT (section, feature) DO NOTHING;

-- ---------------------------------------------------------------------
-- A4. Canonical grants for the 190 base permissions (SA + Sup + Op).
--     Idempotent via ON CONFLICT (permission_id, role) DO NOTHING.
-- ---------------------------------------------------------------------
-- Super-Admin: full access
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, 'Super-Admin', true, 'all'
FROM public.app_permissions p
WHERE p.feature <> 'view_billing_data'
  AND NOT (p.section='customer_directory' AND p.feature IN ('script_view','script_edit','contact_ooo_edit'))
  AND p.section <> 'daily_checklist'
ON CONFLICT (permission_id, role) DO NOTHING;

-- Supervisor
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, 'Supervisor',
  CASE
    WHEN p.feature = 'menu_visible' AND p.section IN ('leave_types_config','database_reset') THEN false
    WHEN p.feature = 'menu_visible' THEN true
    WHEN p.feature = 'page_access' AND p.section IN ('database_reset','leave_types_config') THEN false
    WHEN p.feature = 'page_access' THEN true
    WHEN p.feature = 'view' AND p.section IN ('database_reset','leave_types_config') THEN false
    WHEN p.feature = 'view' THEN true
    WHEN p.feature = 'create' AND p.section IN ('database_reset','leave_types_config','packages_pricing','user_management','call_billing','holiday_admin_panel') THEN false
    WHEN p.feature = 'create' THEN true
    WHEN p.feature = 'edit' AND p.section IN ('database_reset','leave_types_config','user_management','packages_pricing') THEN false
    WHEN p.feature = 'edit' THEN true
    WHEN p.feature = 'delete' AND p.section IN ('database_reset','leave_types_config','packages_pricing','user_management','holiday_admin_panel','call_billing','news') THEN false
    WHEN p.feature = 'delete' THEN true
    WHEN p.feature = 'assign' AND p.section IN ('database_reset','leave_types_config','packages_pricing','user_management','call_billing') THEN false
    WHEN p.feature = 'assign' THEN true
    WHEN p.feature = 'approve' AND p.section IN ('database_reset','leave_types_config','packages_pricing','user_management','call_billing') THEN false
    WHEN p.feature = 'approve' THEN true
    WHEN p.feature = 'export' AND p.section IN ('database_reset','leave_types_config','user_management') THEN false
    WHEN p.feature = 'export' THEN true
    WHEN p.feature = 'manage_settings' THEN false
    ELSE false
  END,
  CASE
    WHEN p.section IN ('database_reset','leave_types_config') THEN 'none'
    WHEN p.section = 'user_management' THEN 'team'
    WHEN p.section IN ('call_billing','packages_pricing') THEN 'all'
    ELSE 'team'
  END
FROM public.app_permissions p
WHERE p.feature <> 'view_billing_data'
  AND NOT (p.section='customer_directory' AND p.feature IN ('script_view','script_edit','contact_ooo_edit'))
  AND p.section <> 'daily_checklist'
ON CONFLICT (permission_id, role) DO NOTHING;

-- Operator
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, 'Operator',
  CASE
    WHEN p.feature = 'menu_visible' AND p.section IN ('call_billing','user_management','holiday_admin_panel','leave_types_config','packages_pricing','database_reset') THEN false
    WHEN p.feature = 'menu_visible' THEN true
    WHEN p.feature = 'page_access' AND p.section IN ('call_billing','user_management','holiday_admin_panel','leave_types_config','packages_pricing','database_reset') THEN false
    WHEN p.feature = 'page_access' THEN true
    WHEN p.feature = 'view' AND p.section IN ('call_billing','user_management','holiday_admin_panel','leave_types_config','packages_pricing','database_reset') THEN false
    WHEN p.feature = 'view' THEN true
    WHEN p.feature = 'create' AND p.section IN ('noticeboard','news','call_billing','user_management','holiday_admin_panel','leave_types_config','packages_pricing','database_reset','shift_scheduler') THEN false
    WHEN p.feature = 'create' THEN true
    WHEN p.feature = 'edit' AND p.section IN ('home_page','noticeboard','news','call_billing','user_management','holiday_admin_panel','leave_types_config','packages_pricing','database_reset','shift_scheduler') THEN false
    WHEN p.feature = 'edit' THEN true
    WHEN p.feature = 'delete' THEN false
    WHEN p.feature = 'assign' THEN false
    WHEN p.feature = 'approve' THEN false
    WHEN p.feature = 'export' AND p.section IN ('documents') THEN true
    WHEN p.feature = 'export' THEN false
    WHEN p.feature = 'manage_settings' THEN false
    ELSE false
  END,
  CASE
    WHEN p.section IN ('call_billing','user_management','holiday_admin_panel','leave_types_config','packages_pricing','database_reset') THEN 'none'
    WHEN p.section IN ('chat') THEN 'team'
    ELSE 'own'
  END
FROM public.app_permissions p
WHERE p.feature <> 'view_billing_data'
  AND NOT (p.section='customer_directory' AND p.feature IN ('script_view','script_edit','contact_ooo_edit'))
  AND p.section <> 'daily_checklist'
ON CONFLICT (permission_id, role) DO NOTHING;

-- A5. task_manager.view_billing_data grants (SA, Sup, Op) — 3 rows
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, r.role, r.granted, r.scope
FROM public.app_permissions p
CROSS JOIN (VALUES
  ('Super-Admin', true,  'all'),
  ('Supervisor',  true,  'all'),
  ('Operator',    false, 'none')
) AS r(role, granted, scope)
WHERE p.section='task_manager' AND p.feature='view_billing_data'
ON CONFLICT (permission_id, role) DO NOTHING;

-- A6. customer_directory.script_view / script_edit grants (Admin + Supervisor) — 4 rows
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, r.role, true, 'all'
FROM public.app_permissions p
CROSS JOIN (VALUES ('Admin'), ('Supervisor')) AS r(role)
WHERE p.section='customer_directory' AND p.feature IN ('script_view','script_edit')
ON CONFLICT (permission_id, role) DO NOTHING;

-- A7. customer_directory.contact_ooo_edit grants (SA, Sup, Admin, Op) — 4 rows
--     Manager intentionally excluded per binding restriction.
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, r.role, true, 'all'
FROM public.app_permissions p
CROSS JOIN (VALUES ('Super-Admin'),('Supervisor'),('Admin'),('Operator')) AS r(role)
WHERE p.section='customer_directory' AND p.feature='contact_ooo_edit'
ON CONFLICT (permission_id, role) DO NOTHING;

-- ---------------------------------------------------------------------
-- A8. Verification block — abort the whole migration on any mismatch.
-- ---------------------------------------------------------------------
DO $verify$
DECLARE
  v_perms int;
  v_sections int;
  v_grants int;
  v_sa int; v_sup int; v_op int; v_admin int; v_hr int; v_mgr int;
BEGIN
  SELECT count(*) INTO v_perms FROM public.app_permissions;
  SELECT count(DISTINCT section) INTO v_sections FROM public.app_permissions;
  SELECT count(*) INTO v_grants FROM public.app_permission_grants;
  SELECT count(*) INTO v_sa    FROM public.app_permission_grants WHERE role='Super-Admin';
  SELECT count(*) INTO v_sup   FROM public.app_permission_grants WHERE role='Supervisor';
  SELECT count(*) INTO v_op    FROM public.app_permission_grants WHERE role='Operator';
  SELECT count(*) INTO v_admin FROM public.app_permission_grants WHERE role='Admin';
  SELECT count(*) INTO v_hr    FROM public.app_permission_grants WHERE role='HR';
  SELECT count(*) INTO v_mgr   FROM public.app_permission_grants WHERE role='Manager';

  IF v_perms <> 201 THEN
    RAISE EXCEPTION 'app_permissions row count mismatch: got % expected 201', v_perms;
  END IF;
  IF v_sections <> 20 THEN
    RAISE EXCEPTION 'app_permissions section count mismatch: got % expected 20', v_sections;
  END IF;
  IF v_grants <> 581 THEN
    RAISE EXCEPTION 'app_permission_grants total mismatch: got % expected 581', v_grants;
  END IF;
  IF v_sa <> 192 THEN RAISE EXCEPTION 'Super-Admin grant count mismatch: got % expected 192', v_sa; END IF;
  IF v_sup <> 194 THEN RAISE EXCEPTION 'Supervisor grant count mismatch: got % expected 194', v_sup; END IF;
  IF v_op <> 192 THEN RAISE EXCEPTION 'Operator grant count mismatch: got % expected 192', v_op; END IF;
  IF v_admin <> 3 THEN RAISE EXCEPTION 'Admin grant count mismatch: got % expected 3', v_admin; END IF;
  IF v_hr <> 0 THEN RAISE EXCEPTION 'HR grant count mismatch: got % expected 0', v_hr; END IF;
  IF v_mgr <> 0 THEN RAISE EXCEPTION 'Manager grant count mismatch: got % expected 0 (Manager excluded)', v_mgr; END IF;
END
$verify$;

-- =====================================================================
-- B. Atomic profiles.role sync in admin_create_system_user /
--    admin_update_system_user (with role validation + profile guard).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_create_system_user(
  p_user_id uuid,
  p_name    text,
  p_email   text,
  p_role    text,
  p_status  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Role validation (Stage 1)
  IF p_role IS NULL OR p_role NOT IN ('Operator','Supervisor','HR','Admin','Super-Admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  -- Profile must already exist (created by admin-create-user edge function)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Profile missing for user %; create profile before inserting system_user', p_user_id;
  END IF;

  INSERT INTO public.system_users (user_id, name, email, role, status)
  VALUES (p_user_id, p_name, p_email, p_role, p_status)
  RETURNING id INTO v_id;

  -- Atomic role sync
  UPDATE public.profiles
     SET role = p_role::public.user_role,
         name = COALESCE(NULLIF(name,''), p_name),
         status = COALESCE(NULLIF(status,''), 'Active'),
         updated_at = now()
   WHERE user_id = p_user_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_system_user(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_current_address text DEFAULT NULL,
  p_current_post_code text DEFAULT NULL,
  p_permanent_address text DEFAULT NULL,
  p_permanent_post_code text DEFAULT NULL,
  p_home_phone text DEFAULT NULL,
  p_mobile_phone text DEFAULT NULL,
  p_national_insurance text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_ethnicity text DEFAULT NULL,
  p_nationality text DEFAULT NULL,
  p_disability text DEFAULT NULL,
  p_disability_category text DEFAULT NULL,
  p_marital_status text DEFAULT NULL,
  p_emergency_name text DEFAULT NULL,
  p_emergency_relationship text DEFAULT NULL,
  p_emergency_address text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_bank_address text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_sort_code text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_annual_leave_days numeric DEFAULT NULL,
  p_sick_leave_days numeric DEFAULT NULL,
  p_personal_days numeric DEFAULT NULL,
  p_public_holidays numeric DEFAULT NULL,
  p_christmas_closure_days numeric DEFAULT NULL,
  p_carried_over_days numeric DEFAULT NULL,
  p_start_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Role validation when a new role is supplied (Stage 1)
  IF p_role IS NOT NULL AND p_role NOT IN ('Operator','Supervisor','HR','Admin','Super-Admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  UPDATE public.system_users SET
    name = COALESCE(p_name, name),
    email = COALESCE(p_email, email),
    role = COALESCE(p_role, role),
    status = COALESCE(p_status, status),
    department = COALESCE(p_department, department),
    position = COALESCE(p_job_title, position),
    phone_number = COALESCE(p_mobile_phone, phone_number),
    start_date = COALESCE(p_start_date, start_date),
    annual_leave_entitlement = COALESCE(p_annual_leave_days, annual_leave_entitlement),
    updated_at = now()
  WHERE id = p_id
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Atomic profiles.role sync when role is being changed.
  -- Requires an existing profile row — must fail if missing, never create.
  IF p_role IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user_id) THEN
      RAISE EXCEPTION 'Profile missing for user %; cannot sync role', v_user_id;
    END IF;
    UPDATE public.profiles
       SET role = p_role::public.user_role,
           updated_at = now()
     WHERE user_id = v_user_id;
  END IF;

  IF p_annual_leave_days IS NOT NULL OR
     p_sick_leave_days IS NOT NULL OR
     p_personal_days IS NOT NULL OR
     p_public_holidays IS NOT NULL OR
     p_christmas_closure_days IS NOT NULL OR
     p_carried_over_days IS NOT NULL THEN
    INSERT INTO public.holiday_entitlements (
      user_id, year, annual_leave_entitlement, sick_leave_entitlement,
      personal_days_entitlement, public_holidays, christmas_closure_days, carried_over
    )
    SELECT
      v_user_id, v_year,
      COALESCE(p_annual_leave_days, su.annual_leave_entitlement, 25),
      COALESCE(p_sick_leave_days, 0),
      COALESCE(p_personal_days, 0),
      COALESCE(p_public_holidays, 0),
      COALESCE(p_christmas_closure_days, 0),
      COALESCE(p_carried_over_days, 0)
    FROM public.system_users su
    WHERE su.id = p_id
    ON CONFLICT (user_id, year) DO UPDATE SET
      annual_leave_entitlement = COALESCE(p_annual_leave_days, holiday_entitlements.annual_leave_entitlement),
      sick_leave_entitlement = COALESCE(p_sick_leave_days, holiday_entitlements.sick_leave_entitlement),
      personal_days_entitlement = COALESCE(p_personal_days, holiday_entitlements.personal_days_entitlement),
      public_holidays = COALESCE(p_public_holidays, holiday_entitlements.public_holidays),
      christmas_closure_days = COALESCE(p_christmas_closure_days, holiday_entitlements.christmas_closure_days),
      carried_over = COALESCE(p_carried_over_days, holiday_entitlements.carried_over),
      updated_at = now();
  END IF;
END;
$function$;

COMMIT;
