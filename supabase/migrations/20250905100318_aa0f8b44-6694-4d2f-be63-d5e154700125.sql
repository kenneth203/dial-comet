-- Drop the existing functions and recreate them with correct column references
DROP FUNCTION IF EXISTS public.get_all_basic_user_profiles();
DROP FUNCTION IF EXISTS public.get_basic_user_profile();

-- Recreate the functions to match the actual comprehensive_users schema
CREATE OR REPLACE FUNCTION public.get_all_basic_user_profiles()
 RETURNS TABLE(
   id uuid, 
   auth_user_id uuid, 
   name text, 
   email text, 
   phone_number text, 
   role text, 
   status text, 
   employee_id text, 
   department text, 
   job_position text, 
   contract_type text, 
   working_hours_per_week numeric, 
   start_date date, 
   annual_leave_entitlement numeric, 
   city text, 
   country text, 
   is_system_user boolean, 
   is_staff_member boolean, 
   created_at timestamp with time zone, 
   updated_at timestamp with time zone
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.city,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE is_admin_or_higher() OR cu.auth_user_id = auth.uid()
  ORDER BY cu.name;
$function$;

-- Recreate the individual user profile function
CREATE OR REPLACE FUNCTION public.get_basic_user_profile()
 RETURNS TABLE(
   id uuid, 
   auth_user_id uuid, 
   name text, 
   email text, 
   phone_number text, 
   role text, 
   status text, 
   employee_id text, 
   department text, 
   job_position text, 
   contract_type text, 
   working_hours_per_week numeric, 
   start_date date, 
   annual_leave_entitlement numeric, 
   city text, 
   country text, 
   is_system_user boolean, 
   is_staff_member boolean, 
   created_at timestamp with time zone, 
   updated_at timestamp with time zone
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.city,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid();
$function$;