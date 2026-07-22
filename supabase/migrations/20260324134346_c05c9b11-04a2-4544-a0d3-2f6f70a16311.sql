
-- Drop the old function first (return type changed)
DROP FUNCTION IF EXISTS public.get_permissions_matrix_secure();

-- Add scope column to app_permission_grants
ALTER TABLE public.app_permission_grants 
ADD COLUMN IF NOT EXISTS scope text DEFAULT 'none';

-- Clear existing permissions data and re-seed for new 3-role system
DELETE FROM public.app_permission_grants;
DELETE FROM public.app_permissions;

-- Insert all module permissions (19 modules × 10 permission features)
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
('database_reset', 'manage_settings', 'Settings', 'Manage database reset settings');

-- SUPER-ADMIN: Full access to everything
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, 'Super-Admin', true, 'all'
FROM public.app_permissions p;

-- SUPERVISOR grants
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, 'Supervisor',
  CASE
    WHEN p.feature = 'menu_visible' AND p.section IN ('leave_types_config', 'database_reset') THEN false
    WHEN p.feature = 'menu_visible' THEN true
    WHEN p.feature = 'page_access' AND p.section IN ('database_reset', 'leave_types_config') THEN false
    WHEN p.feature = 'page_access' THEN true
    WHEN p.feature = 'view' AND p.section IN ('database_reset', 'leave_types_config') THEN false
    WHEN p.feature = 'view' THEN true
    WHEN p.feature = 'create' AND p.section IN ('database_reset', 'leave_types_config', 'packages_pricing', 'user_management', 'call_billing', 'holiday_admin_panel') THEN false
    WHEN p.feature = 'create' THEN true
    WHEN p.feature = 'edit' AND p.section IN ('database_reset', 'leave_types_config', 'user_management', 'packages_pricing') THEN false
    WHEN p.feature = 'edit' THEN true
    WHEN p.feature = 'delete' AND p.section IN ('database_reset', 'leave_types_config', 'packages_pricing', 'user_management', 'holiday_admin_panel', 'call_billing', 'news') THEN false
    WHEN p.feature = 'delete' THEN true
    WHEN p.feature = 'assign' AND p.section IN ('database_reset', 'leave_types_config', 'packages_pricing', 'user_management', 'call_billing') THEN false
    WHEN p.feature = 'assign' THEN true
    WHEN p.feature = 'approve' AND p.section IN ('database_reset', 'leave_types_config', 'packages_pricing', 'user_management', 'call_billing') THEN false
    WHEN p.feature = 'approve' THEN true
    WHEN p.feature = 'export' AND p.section IN ('database_reset', 'leave_types_config', 'user_management') THEN false
    WHEN p.feature = 'export' THEN true
    WHEN p.feature = 'manage_settings' THEN false
    ELSE false
  END,
  CASE
    WHEN p.section IN ('database_reset', 'leave_types_config') THEN 'none'
    WHEN p.section = 'user_management' THEN 'team'
    WHEN p.section IN ('call_billing', 'packages_pricing') THEN 'all'
    ELSE 'team'
  END
FROM public.app_permissions p;

-- OPERATOR grants
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, 'Operator',
  CASE
    WHEN p.feature = 'menu_visible' AND p.section IN ('call_billing', 'user_management', 'holiday_admin_panel', 'leave_types_config', 'packages_pricing', 'database_reset') THEN false
    WHEN p.feature = 'menu_visible' THEN true
    WHEN p.feature = 'page_access' AND p.section IN ('call_billing', 'user_management', 'holiday_admin_panel', 'leave_types_config', 'packages_pricing', 'database_reset') THEN false
    WHEN p.feature = 'page_access' THEN true
    WHEN p.feature = 'view' AND p.section IN ('call_billing', 'user_management', 'holiday_admin_panel', 'leave_types_config', 'packages_pricing', 'database_reset') THEN false
    WHEN p.feature = 'view' THEN true
    WHEN p.feature = 'create' AND p.section IN ('noticeboard', 'news', 'call_billing', 'user_management', 'holiday_admin_panel', 'leave_types_config', 'packages_pricing', 'database_reset', 'shift_scheduler') THEN false
    WHEN p.feature = 'create' THEN true
    WHEN p.feature = 'edit' AND p.section IN ('home_page', 'noticeboard', 'news', 'call_billing', 'user_management', 'holiday_admin_panel', 'leave_types_config', 'packages_pricing', 'database_reset', 'shift_scheduler') THEN false
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
    WHEN p.section IN ('call_billing', 'user_management', 'holiday_admin_panel', 'leave_types_config', 'packages_pricing', 'database_reset') THEN 'none'
    WHEN p.section IN ('chat') THEN 'team'
    ELSE 'own'
  END
FROM public.app_permissions p;

-- Add unique constraint for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_permission_grants_permission_id_role_key'
  ) THEN
    ALTER TABLE public.app_permission_grants 
    ADD CONSTRAINT app_permission_grants_permission_id_role_key 
    UNIQUE (permission_id, role);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Function to get permissions for the current user's role
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (
  section text,
  feature text,
  granted boolean,
  scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT profiles.role::text INTO user_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF user_role IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    p.section,
    p.feature,
    COALESCE(g.granted, false),
    COALESCE(g.scope, 'none')
  FROM app_permissions p
  LEFT JOIN app_permission_grants g ON g.permission_id = p.id AND g.role = user_role
  ORDER BY p.section, p.feature;
END;
$$;

-- New get_permissions_matrix_secure with scope support
CREATE OR REPLACE FUNCTION public.get_permissions_matrix_secure()
RETURNS TABLE (
  id uuid,
  section text,
  feature text,
  icon text,
  description text,
  role text,
  granted boolean,
  scope text
)
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

  RETURN QUERY
  SELECT 
    p.id,
    p.section,
    p.feature,
    p.icon,
    p.description,
    g.role,
    g.granted,
    g.scope
  FROM app_permissions p
  LEFT JOIN app_permission_grants g ON g.permission_id = p.id
  ORDER BY p.section, p.feature, g.role;
END;
$$;

-- Updated update_permission_grant for scope support
CREATE OR REPLACE FUNCTION public.update_permission_grant(
  p_permission_id uuid,
  p_role text,
  p_granted boolean,
  p_scope text DEFAULT NULL
)
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
