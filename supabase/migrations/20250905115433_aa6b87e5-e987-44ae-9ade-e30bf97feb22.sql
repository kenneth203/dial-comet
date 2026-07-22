-- Fix security issues in the functions by removing SECURITY DEFINER and adding proper RLS policies

-- Drop the previous functions with SECURITY DEFINER
DROP FUNCTION IF EXISTS public.get_active_chat_users();
DROP FUNCTION IF EXISTS public.get_user_display_name(uuid);

-- Create secure functions without SECURITY DEFINER, relying on RLS policies instead
CREATE OR REPLACE FUNCTION public.get_active_chat_users()
RETURNS TABLE(user_id uuid, name text, email text)
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT 
    su.user_id,
    su.name,
    su.email
  FROM public.system_users su
  WHERE su.status = 'Active'
    AND su.user_id != auth.uid()  -- Exclude current user
    AND su.user_id IS NOT NULL
    AND auth.uid() IS NOT NULL    -- Ensure user is authenticated
  ORDER BY su.name;
$$;

-- Create function to get user display name
CREATE OR REPLACE FUNCTION public.get_user_display_name(target_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  SELECT COALESCE(su.name, p.name, 'Unknown User')
  FROM public.system_users su
  LEFT JOIN public.profiles p ON p.user_id = target_user_id
  WHERE su.user_id = target_user_id
    AND auth.uid() IS NOT NULL    -- Ensure user is authenticated
  LIMIT 1;
$$;