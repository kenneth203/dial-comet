-- Fix security warnings by setting proper search paths

-- Update the get_current_user_role function with proper search path
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path TO 'public';

-- Update the is_admin_or_higher function with proper search path  
CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
RETURNS BOOLEAN AS $$
  SELECT CASE 
    WHEN public.get_current_user_role() IN ('Super-Admin', 'Admin', 'Supervisor') THEN true
    ELSE false
  END
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path TO 'public';

-- Update the existing handle_new_user function to have proper search path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, status)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email), 
    'Operator',
    'Active'
  );
  RETURN NEW;
END;
$function$;

-- Update the update_updated_at_column function to have proper search path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;