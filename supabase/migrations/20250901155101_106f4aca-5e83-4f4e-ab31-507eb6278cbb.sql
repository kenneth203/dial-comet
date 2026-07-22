-- Drop and recreate the function to fix the ambiguous user_id reference
DROP FUNCTION IF EXISTS public.get_all_system_users_for_management();

CREATE OR REPLACE FUNCTION public.get_all_system_users_for_management()
 RETURNS TABLE(auth_user_id uuid, system_user_id uuid, name text, role text, status text, department text, staff_position text, employee_id text, email text, phone_number text, start_date date, annual_leave_entitlement numeric, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, line_manager_id uuid, working_hours_per_week numeric, contract_type text, date_of_birth date, address_line1 text, city text, country text, postal_code text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT 
    su.user_id AS auth_user_id,
    su.id AS system_user_id,
    su.name,
    su.role,
    su.status,
    su.department,
    su.job_title AS staff_position,
    su.employee_id,
    su.email,
    su.mobile_phone AS phone_number,
    su.start_date,
    su.annual_leave_days AS annual_leave_entitlement,
    su.emergency_name AS emergency_contact_name,
    su.emergency_phone AS emergency_contact_phone,
    su.emergency_relationship AS emergency_contact_relationship,
    NULL::uuid AS line_manager_id,
    37.5 AS working_hours_per_week,
    'full_time' AS contract_type,
    su.date_of_birth,
    su.current_address AS address_line1,
    NULL AS city,
    su.nationality AS country,
    su.current_post_code AS postal_code,
    su.created_at,
    su.updated_at
  FROM public.system_users su
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role IN ('Admin', 'Super-Admin', 'Supervisor')
    AND p.status = 'Active'
  )
  ORDER BY su.name;
$function$