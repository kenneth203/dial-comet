-- Create app_permissions table to store all available permissions
CREATE TABLE public.app_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL,
  feature TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(section, feature)
);

-- Create app_permission_grants table to store which roles have which permissions
CREATE TABLE public.app_permission_grants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  permission_id UUID NOT NULL REFERENCES public.app_permissions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(permission_id, role)
);

-- Enable RLS
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_permission_grants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_permissions
CREATE POLICY "Authenticated users can view permissions" 
ON public.app_permissions 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super-Admin and Admin can manage permissions" 
ON public.app_permissions 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin')
  )
);

-- RLS Policies for app_permission_grants
CREATE POLICY "Authenticated users can view permission grants" 
ON public.app_permission_grants 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super-Admin and Admin can manage permission grants" 
ON public.app_permission_grants 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin')
  )
);

-- Insert the existing permissions data
INSERT INTO public.app_permissions (section, feature, icon, description) VALUES
-- Dashboard Section
('Dashboard', 'Access dashboard', 'LayoutDashboard', 'View main dashboard interface'),
('Dashboard', 'View team status', 'Users', 'See team member availability and status'),
('Dashboard', 'Manage tasks', 'CheckSquare', 'Create, edit, and assign tasks'),
('Dashboard', 'View statistics', 'BarChart3', 'Access performance metrics and charts'),
('Dashboard', 'Access noticeboard', 'MessageSquare', 'View and manage company announcements'),

-- User Management Section
('User Management', 'View user profiles', 'User', 'See basic user information'),
('User Management', 'Edit user roles', 'Shield', 'Modify user permissions and access levels'),
('User Management', 'Delete users', 'UserX', 'Remove users from the system'),
('User Management', 'View sensitive data', 'Eye', 'Access personal and confidential information'),

-- Holiday Management Section
('Holiday Management', 'View own holidays', 'Calendar', 'See personal holiday requests and balance'),
('Holiday Management', 'Request holidays', 'CalendarPlus', 'Submit new holiday requests'),
('Holiday Management', 'View team holidays', 'CalendarDays', 'See all team member holiday schedules'),
('Holiday Management', 'Approve/Decline requests', 'CheckCircle', 'Process holiday request approvals'),
('Holiday Management', 'Manage entitlements', 'Settings', 'Configure holiday allowances and policies'),

-- Financial Data Section
('Financial Data', 'View billing dashboard', 'CreditCard', 'Access customer billing and invoicing'),
('Financial Data', 'Manage invoices', 'Receipt', 'Create, edit, and send invoices'),
('Financial Data', 'Access call logs', 'Phone', 'View detailed call records and statistics'),
('Financial Data', 'Export reports', 'Download', 'Generate and download financial reports'),

-- Customer Management Section
('Customer Management', 'View customers', 'Building', 'See customer profiles and information'),
('Customer Management', 'Edit customers', 'Edit', 'Modify customer details and settings'),
('Customer Management', 'Manage locations', 'MapPin', 'Handle multiple customer locations'),
('Customer Management', 'View customer scripts', 'FileText', 'Access call handling scripts'),

-- Documents Section
('Documents', 'Upload documents', 'Upload', 'Add new files to the system'),
('Documents', 'Download documents', 'Download', 'Access and download shared files'),
('Documents', 'Delete documents', 'Trash2', 'Remove files from the system'),
('Documents', 'Share documents', 'Share', 'Control document access permissions'),

-- Scheduler Section
('Scheduler', 'View schedules', 'Calendar', 'See shift schedules and assignments'),
('Scheduler', 'Create shifts', 'Plus', 'Add new shifts to the schedule'),
('Scheduler', 'Assign shifts', 'UserCheck', 'Assign team members to shifts'),
('Scheduler', 'Manage templates', 'Copy', 'Create and edit shift templates'),

-- Chat Section
('Chat', 'Send messages', 'MessageCircle', 'Participate in team communications'),
('Chat', 'Create rooms', 'Plus', 'Start new chat rooms or conversations'),
('Chat', 'View all rooms', 'Users', 'Access all available chat rooms'),

-- System Administration Section
('System Administration', 'Database reset', 'Database', 'Reset system data (DANGEROUS)'),
('System Administration', 'System settings', 'Settings', 'Configure system-wide preferences'),
('System Administration', 'View audit logs', 'FileSearch', 'Access system activity logs'),
('System Administration', 'Manage permissions', 'Shield', 'Configure role-based access control');

-- Insert permission grants for each role
INSERT INTO public.app_permission_grants (permission_id, role, granted)
SELECT 
  p.id,
  'Super-Admin',
  true -- Super-Admin has access to everything
FROM public.app_permissions p;

INSERT INTO public.app_permission_grants (permission_id, role, granted)
SELECT 
  p.id,
  'Admin',
  CASE 
    WHEN p.section IN ('Dashboard', 'User Management', 'Holiday Management', 'Financial Data', 'Customer Management', 'Documents', 'Scheduler', 'Chat') THEN true
    WHEN p.section = 'System Administration' AND p.feature NOT IN ('Database reset') THEN true
    ELSE false
  END
FROM public.app_permissions p;

INSERT INTO public.app_permission_grants (permission_id, role, granted)
SELECT 
  p.id,
  'HR',
  CASE 
    WHEN p.section IN ('Dashboard', 'Holiday Management', 'Financial Data', 'Documents', 'Chat') THEN true
    WHEN p.section = 'User Management' AND p.feature IN ('View user profiles', 'View sensitive data') THEN true
    WHEN p.section = 'Customer Management' AND p.feature IN ('View customers') THEN true
    WHEN p.section = 'Scheduler' AND p.feature IN ('View schedules') THEN true
    ELSE false
  END
FROM public.app_permissions p;

INSERT INTO public.app_permission_grants (permission_id, role, granted)
SELECT 
  p.id,
  'Supervisor',
  CASE 
    WHEN p.section IN ('Dashboard', 'Customer Management', 'Documents', 'Scheduler', 'Chat') THEN true
    WHEN p.section = 'Holiday Management' AND p.feature IN ('View own holidays', 'Request holidays', 'View team holidays', 'Approve/Decline requests') THEN true
    WHEN p.section = 'User Management' AND p.feature IN ('View user profiles') THEN true
    ELSE false
  END
FROM public.app_permissions p;

INSERT INTO public.app_permission_grants (permission_id, role, granted)
SELECT 
  p.id,
  'Operator',
  CASE 
    WHEN p.section = 'Dashboard' AND p.feature IN ('Access dashboard', 'View team status', 'Access noticeboard') THEN true
    WHEN p.section = 'Holiday Management' AND p.feature IN ('View own holidays', 'Request holidays') THEN true
    WHEN p.section = 'Customer Management' AND p.feature IN ('View customers', 'View customer scripts') THEN true
    WHEN p.section = 'Documents' AND p.feature IN ('Download documents') THEN true
    WHEN p.section = 'Scheduler' AND p.feature IN ('View schedules') THEN true
    WHEN p.section = 'Chat' AND p.feature IN ('Send messages') THEN true
    ELSE false
  END
FROM public.app_permissions p;

-- Create a view for easy querying of the permissions matrix
CREATE OR REPLACE VIEW public.v_permissions_matrix AS
SELECT 
  p.id,
  p.section,
  p.feature,
  p.icon,
  p.description,
  pg.role,
  pg.granted,
  pg.id as grant_id
FROM public.app_permissions p
LEFT JOIN public.app_permission_grants pg ON p.id = pg.permission_id
ORDER BY p.section, p.feature, pg.role;

-- Create function to update permission grants
CREATE OR REPLACE FUNCTION public.update_permission_grant(
  p_permission_id UUID,
  p_role TEXT,
  p_granted BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only Super-Admin and Admin can update permissions
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'Admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: Only Super-Admin and Admin can update permissions';
  END IF;

  -- Insert or update the permission grant
  INSERT INTO public.app_permission_grants (permission_id, role, granted)
  VALUES (p_permission_id, p_role, p_granted)
  ON CONFLICT (permission_id, role) 
  DO UPDATE SET 
    granted = p_granted,
    updated_at = now();

  RETURN TRUE;
END;
$$;