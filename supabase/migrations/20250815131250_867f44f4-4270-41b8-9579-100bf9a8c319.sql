-- SECURITY FIX: Create more restrictive RLS policy
-- Drop the current policy and create a truly secure one
DROP POLICY IF EXISTS "Users can view basic info of all users and full info of their own record" ON public.system_users;

-- Create role-based access policy
CREATE POLICY "Restricted access to system_users" 
ON public.system_users 
FOR SELECT 
USING (
  -- Users can only see their own full record
  auth.uid() = user_id 
  OR 
  -- Admins can see all records
  (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role IN ('Admin', 'Super-Admin', 'Supervisor')
    )
  )
);

-- Update the get_assignable_users function to be even more secure
-- Only expose minimal data needed for task assignment
CREATE OR REPLACE FUNCTION public.get_assignable_users()
RETURNS TABLE(id uuid, name text, role text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT system_users.id, system_users.name, system_users.role, system_users.status 
  FROM public.system_users 
  WHERE system_users.status = 'Active'
  ORDER BY system_users.name
$function$;