-- Use the existing security definer function to avoid recursion
DROP POLICY IF EXISTS "Admins can update system users" ON public.system_users;

-- Create a safer policy using the existing get_current_user_role function
CREATE POLICY "Authorized users can update system users" 
ON public.system_users 
FOR UPDATE 
USING (
  public.get_current_user_role() IN ('Admin', 'Super-Admin', 'Supervisor')
  OR auth.uid() = user_id  -- Users can still update their own records
);