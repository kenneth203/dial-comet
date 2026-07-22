
-- Add view_billing_data permission to task_manager module
INSERT INTO app_permissions (section, feature, description, icon)
VALUES ('task_manager', 'view_billing_data', 'View cost, billable time and total time on tasks', 'CreditCard');

-- Get the permission ID and create grants for each role
DO $$
DECLARE
  perm_id uuid;
BEGIN
  SELECT id INTO perm_id FROM app_permissions WHERE section = 'task_manager' AND feature = 'view_billing_data';
  
  -- Super-Admin: granted
  INSERT INTO app_permission_grants (permission_id, role, granted, scope)
  VALUES (perm_id, 'Super-Admin', true, 'all');
  
  -- Supervisor: granted
  INSERT INTO app_permission_grants (permission_id, role, granted, scope)
  VALUES (perm_id, 'Supervisor', true, 'all');
  
  -- Operator: not granted
  INSERT INTO app_permission_grants (permission_id, role, granted, scope)
  VALUES (perm_id, 'Operator', false, 'none');
END $$;
