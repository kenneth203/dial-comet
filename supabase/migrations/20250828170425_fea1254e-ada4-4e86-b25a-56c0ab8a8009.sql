-- Create a more appropriate RLS policy for system_users updates
-- First, drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can update their own system user record" ON public.system_users;

-- Create a new policy that allows admins and supervisors to update system users
CREATE POLICY "Admins can update system users" 
ON public.system_users 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
  OR auth.uid() = user_id  -- Users can still update their own records
);