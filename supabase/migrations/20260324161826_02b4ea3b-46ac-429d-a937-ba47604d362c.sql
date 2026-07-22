-- Fix: Update comprehensive_users to match system_users data for mismatched records
UPDATE public.comprehensive_users cu
SET 
  name = su.name,
  email = su.email,
  role = su.role,
  status = su.status,
  department = su.department,
  job_position = su.job_title,
  updated_at = now()
FROM public.system_users su
WHERE cu.auth_user_id = su.user_id
AND (cu.name <> su.name OR cu.email <> su.email OR cu.role <> su.role);