-- Update the RLS policy to allow Admin users to access system_users table
DROP POLICY IF EXISTS "HR_SuperAdmin_emergency_system_users_access" ON public.system_users;

CREATE POLICY "Admin_HR_SuperAdmin_system_users_access" 
ON public.system_users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = ANY (ARRAY['Admin'::user_role, 'HR'::user_role, 'Super-Admin'::user_role]) 
    AND profiles.status = 'Active'::user_status
  )
);