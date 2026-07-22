-- Create index for system_users to improve performance
CREATE INDEX IF NOT EXISTS idx_system_users_status_active ON public.system_users(status) WHERE status = 'Active';

-- Function to get active chat users (only active system users)
CREATE OR REPLACE FUNCTION public.get_active_chat_users()
RETURNS TABLE(user_id uuid, name text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
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
  ORDER BY su.name;
$$;

-- Function to get user display name for chat
CREATE OR REPLACE FUNCTION public.get_user_display_name(target_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(su.name, p.name, 'Unknown User')
  FROM public.system_users su
  LEFT JOIN public.profiles p ON p.user_id = target_user_id
  WHERE su.user_id = target_user_id
  LIMIT 1;
$$;