-- Fix critical security vulnerability: Restrict profile access properly

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

-- Drop the existing overly permissive policy
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