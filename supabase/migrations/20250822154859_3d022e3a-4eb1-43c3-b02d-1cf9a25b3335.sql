-- Fix search path for functions to address security warnings
ALTER FUNCTION public.reset_expired_statuses() SET search_path = 'public';
ALTER FUNCTION public.update_user_status_timestamp() SET search_path = 'public';