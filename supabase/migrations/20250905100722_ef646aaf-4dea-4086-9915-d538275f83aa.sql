-- Create some sample users in comprehensive_users table for testing shift assignments
-- First check if the table exists and create sample data
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
  (gen_random_uuid(), 'John Smith', 'john.smith@company.com', '+44 123 456 7890', 'Operator', 'Active', 'EMP001', 'Operations', 'Customer Service Agent', false, true),
  (gen_random_uuid(), 'Sarah Johnson', 'sarah.johnson@company.com', '+44 123 456 7891', 'Supervisor', 'Active', 'EMP002', 'Operations', 'Team Lead', false, true),
  (gen_random_uuid(), 'Mike Wilson', 'mike.wilson@company.com', '+44 123 456 7892', 'Operator', 'Active', 'EMP003', 'Technical', 'Technical Support', false, true),
  (gen_random_uuid(), 'Emma Davis', 'emma.davis@company.com', '+44 123 456 7893', 'Operator', 'Active', 'EMP004', 'Operations', 'Customer Service Agent', false, true)
ON CONFLICT DO NOTHING;