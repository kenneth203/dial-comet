
-- 1) Fix RLS recursion on chat_room_members by using a SECURITY DEFINER helper

-- Helper function to check if current user is a member of a room (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.is_member_of_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
  );
$$;

-- Drop the recursive SELECT policy and recreate it using the helper
DROP POLICY IF EXISTS "Users can view members of rooms they belong to" ON public.chat_room_members;

CREATE POLICY "Users can view members of rooms they belong to"
  ON public.chat_room_members
  FOR SELECT
  USING (public.is_member_of_room(room_id));

-- Optional but recommended for performance
CREATE INDEX IF NOT EXISTS idx_chat_room_members_room_user
  ON public.chat_room_members (room_id, user_id);

-- 2) Recreate RPCs with SECURITY DEFINER so non-admins can see "Active" users and display names

-- Make sure old versions are removed
DROP FUNCTION IF EXISTS public.get_active_chat_users();
DROP FUNCTION IF EXISTS public.get_user_display_name(uuid);

-- Return only minimal data needed for the DM picker (id + name); require authentication
CREATE OR REPLACE FUNCTION public.get_active_chat_users()
RETURNS TABLE(user_id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT su.user_id, su.name
  FROM public.system_users su
  WHERE su.status = 'Active'
    AND su.user_id IS NOT NULL
    AND su.user_id <> auth.uid()
  ORDER BY su.name;
END;
$$;

-- Resolve a user's display name (prefer system_users.name, fallback to profiles.name); require authentication
CREATE OR REPLACE FUNCTION public.get_user_display_name(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT name INTO result
  FROM public.system_users
  WHERE user_id = target_user_id
  LIMIT 1;

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  SELECT name INTO result
  FROM public.profiles
  WHERE user_id = target_user_id
  LIMIT 1;

  RETURN COALESCE(result, 'Unknown User');
END;
$$;
