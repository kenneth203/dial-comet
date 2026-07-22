-- 1) Insert new permission features under customer_directory
INSERT INTO public.app_permissions (section, feature, description, icon)
VALUES
  ('customer_directory', 'script_view', 'View customer call script', 'FileText'),
  ('customer_directory', 'script_edit', 'Edit customer call script', 'Pencil')
ON CONFLICT DO NOTHING;

-- 2) Seed default grants for existing roles
WITH new_perms AS (
  SELECT id, feature
  FROM public.app_permissions
  WHERE section = 'customer_directory' AND feature IN ('script_view', 'script_edit')
)
INSERT INTO public.app_permission_grants (permission_id, role, scope, granted)
SELECT p.id, r.role, 'all', true
FROM new_perms p
CROSS JOIN (VALUES ('Admin'), ('Supervisor')) AS r(role)
ON CONFLICT DO NOTHING;
