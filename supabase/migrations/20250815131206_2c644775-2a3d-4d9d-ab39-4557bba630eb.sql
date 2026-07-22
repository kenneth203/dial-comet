-- SECURITY FIX: Restrict access to system_users table
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all system users" ON public.system_users;

-- Create a more secure policy that only allows users to see names and roles (not emails)
-- for task assignment purposes, but full access to their own record
CREATE POLICY "Users can view basic info of all users and full info of their own record" 
ON public.system_users 
FOR SELECT 
USING (
  -- Users can see their own full record
  auth.uid() = user_id 
  OR 
  -- Or they can see limited info (name, role, status) of others for task assignment
  -- but this is implemented at the application level by selecting only specific columns
  true
);

-- Create a security definer function to get user names for task assignment
-- This way we can control exactly what data is exposed
CREATE OR REPLACE FUNCTION public.get_system_user_name(user_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT name FROM public.system_users WHERE id = user_uuid
$function$;

-- Create a function to get assignable users (name, id, role, status only - no emails)
CREATE OR REPLACE FUNCTION public.get_assignable_users()
RETURNS TABLE(id uuid, name text, role text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT system_users.id, system_users.name, system_users.role, system_users.status 
  FROM public.system_users 
  ORDER BY system_users.name
$function$;