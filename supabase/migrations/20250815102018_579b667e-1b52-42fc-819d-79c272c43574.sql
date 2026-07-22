-- Fix the remaining function that doesn't have search path set

CREATE OR REPLACE FUNCTION public.get_user_name(user_uuid uuid)
RETURNS TEXT AS $$
  SELECT name FROM public.profiles WHERE user_id = user_uuid
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path TO 'public';