-- Check if comprehensive_users table exists and create some sample data for testing
-- First, let's create a basic shift instance for testing
INSERT INTO public.shift_instances (
  shift_date,
  start_time,
  end_time,
  role_name,
  color_code,
  headcount_needed,
  headcount_assigned,
  status
) VALUES 
  (CURRENT_DATE, '09:00:00', '17:00:00', 'General Staff', '#3b82f6', 2, 0, 'open'),
  (CURRENT_DATE + INTERVAL '1 day', '10:00:00', '18:00:00', 'Customer Service', '#10b981', 1, 0, 'open'),
  (CURRENT_DATE + INTERVAL '2 days', '08:00:00', '16:00:00', 'Technical Support', '#f59e0b', 3, 0, 'open')
ON CONFLICT DO NOTHING;