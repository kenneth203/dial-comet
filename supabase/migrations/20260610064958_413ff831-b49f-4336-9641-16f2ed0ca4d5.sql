
-- Fix 1: Update is_admin_or_higher to include 'Admin' role
CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('Super-Admin', 'Admin', 'Supervisor')
  )
$$;

-- Fix 2: Remove overly permissive SELECT policy on chat_room_members
DROP POLICY IF EXISTS chat_members_select_auth ON public.chat_room_members;

-- Fix 3: Restrict status_timing_logs SELECT to self or admins
DROP POLICY IF EXISTS status_logs_select_auth ON public.status_timing_logs;
CREATE POLICY status_logs_select_self_or_admin
  ON public.status_timing_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_higher());
