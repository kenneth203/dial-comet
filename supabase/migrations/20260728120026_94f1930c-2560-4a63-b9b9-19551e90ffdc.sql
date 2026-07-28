ALTER TABLE public.user_suspension_state
  ADD COLUMN IF NOT EXISTS suspend_until timestamptz NULL;

CREATE OR REPLACE FUNCTION public.get_my_suspension_status()
RETURNS TABLE (
  state public.suspension_state,
  reason text,
  state_entered_at timestamptz,
  suspend_until timestamptz,
  is_suspended boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(s.state, 'active'::public.suspension_state) AS state,
    s.reason,
    s.state_entered_at,
    s.suspend_until,
    COALESCE(
      s.state = 'suspended'::public.suspension_state
        AND (s.suspend_until IS NULL OR s.suspend_until > now()),
      false
    ) AS is_suspended
  FROM (SELECT auth.uid() AS uid) me
  LEFT JOIN public.user_suspension_state s ON s.user_id = me.uid
  WHERE me.uid IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_suspension_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_suspension_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_suspension_status() TO authenticated;