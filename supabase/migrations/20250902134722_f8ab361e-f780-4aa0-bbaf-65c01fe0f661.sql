-- Create a comprehensive_users record for Joe Campbell
-- First, let's create an auth user entry via comprehensive_users
INSERT INTO public.comprehensive_users (
  name,
  email,
  phone_number,
  role,
  status,
  employee_id,
  department,
  job_position,
  contract_type,
  working_hours_per_week,
  start_date,
  annual_leave_entitlement,
  city,
  country,
  is_system_user,
  is_staff_member
) 
VALUES (
  'Joe Campbell',
  'joe.campbell@vapb.co.uk',
  NULL,
  'Operator',
  'Active',
  'EMP-JOE-001',
  'Operations',
  'Operator',
  'full_time',
  37.5,
  '2024-01-01',
  25.0,
  'Birmingham',
  'United Kingdom',
  true,
  true
)
RETURNING id, auth_user_id;