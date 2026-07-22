-- Add Kate, Joe, and Tara to the comprehensive_users table for shift assignments
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
  -- Create Kate Campbell
  (NULL, 'Kate Campbell', 'kate.campbell@thevateam.co.uk', '+44 123 456 7891', 'Admin', 'Active', 'EMP002', 'Operations', 'Operations Manager', false, true),
  -- Create Joe Campbell  
  (NULL, 'Joe Campbell', 'joe.campbell@thevateam.co.uk', '+44 123 456 7892', 'Supervisor', 'Active', 'EMP003', 'Customer Service', 'Team Lead', false, true),
  -- Create Tara Egan
  (NULL, 'Tara Egan', 'tara.egan@thevateam.co.uk', '+44 123 456 7893', 'Operator', 'Active', 'EMP004', 'Customer Service', 'Customer Service Agent', false, true);