-- Add the missing users to comprehensive_users table so they appear in shift assignments
-- Using the second auth user ID for Kenneth and creating records for Kate, Joe, and Tara

INSERT INTO public.comprehensive_users (
  auth_user_id,
  name,
  email,
  phone_number,
  role,
  status,
  employee_id,
  department,
  job_position,
  is_system_user,
  is_staff_member
) VALUES 
  -- Use the second auth user ID for another Kenneth record or reassign
  ('34fd1b64-9190-4e31-8c20-b20705053fc1', 'Kenneth Pote', 'kenneth@thevateam.co.uk', '+44 123 456 7890', 'Super-Admin', 'Active', 'EMP001', 'Management', 'Owner', true, true),
  -- Create Kate Campbell
  (gen_random_uuid(), 'Kate Campbell', 'kate.campbell@thevateam.co.uk', '+44 123 456 7891', 'Admin', 'Active', 'EMP002', 'Operations', 'Operations Manager', false, true),
  -- Create Joe Campbell  
  (gen_random_uuid(), 'Joe Campbell', 'joe.campbell@thevateam.co.uk', '+44 123 456 7892', 'Supervisor', 'Active', 'EMP003', 'Customer Service', 'Team Lead', false, true),
  -- Create Tara Egan
  (gen_random_uuid(), 'Tara Egan', 'tara.egan@thevateam.co.uk', '+44 123 456 7893', 'Operator', 'Active', 'EMP004', 'Customer Service', 'Customer Service Agent', false, true)
ON CONFLICT (auth_user_id) DO NOTHING;