-- Fix critical security vulnerability: Restrict profile access

-- First, create a security definer function to check user roles without infinite recursion
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create function to check if user has admin privileges
CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
RETURNS BOOLEAN AS $$
  SELECT CASE 
    WHEN public.get_current_user_role() IN ('Super-Admin', 'Admin', 'Supervisor') THEN true
    ELSE false
  END
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Drop the overly permissive policy that allows all users to view all profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create secure replacement policies
-- 1. Users can only view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

-- 2. Admins and higher can view all profiles (for management purposes)
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.is_admin_or_higher());

-- 3. Create a view for limited profile info that can be safely shared (names only for task assignments)
CREATE OR REPLACE VIEW public.user_names AS
SELECT 
  id,
  user_id,
  name
FROM public.profiles;

-- Enable RLS on the view
ALTER VIEW public.user_names SET (security_barrier = true);

-- Allow authenticated users to see names only (for task assignments, etc.)
CREATE POLICY "Users can view names for assignments" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Wait, that's wrong. Let me create a proper limited access policy instead.
-- Remove the last policy
DROP POLICY IF EXISTS "Users can view names for assignments" ON public.profiles;

-- Create a function to get limited user info (just name and id) for task assignments
CREATE OR REPLACE FUNCTION public.get_user_name(user_uuid uuid)
RETURNS TEXT AS $$
  SELECT name FROM public.profiles WHERE user_id = user_uuid
$$ LANGUAGE SQL SECURITY DEFINER STABLE;