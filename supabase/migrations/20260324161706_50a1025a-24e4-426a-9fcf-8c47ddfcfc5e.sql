-- Backfill: insert any system_users missing from comprehensive_users
INSERT INTO public.comprehensive_users (auth_user_id, name, email, role, status, department, job_position, start_date, is_system_user, is_staff_member)
SELECT 
  su.user_id,
  su.name,
  su.email,
  su.role,
  su.status,
  su.department,
  su.job_title,
  su.start_date,
  true,
  true
FROM public.system_users su
WHERE NOT EXISTS (
  SELECT 1 FROM public.comprehensive_users cu 
  WHERE cu.auth_user_id = su.user_id
)
AND su.user_id IS NOT NULL;