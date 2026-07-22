
-- 1. Fix proposal_tokens anon SELECT — require token filter
DROP POLICY IF EXISTS "proposal_select_anon_by_token" ON public.proposal_tokens;

CREATE POLICY "proposal_select_anon_by_token"
  ON public.proposal_tokens FOR SELECT
  TO anon
  USING (
    used_at IS NULL
    AND expires_at > now()
    AND token = current_setting('request.headers', true)::json->>'x-proposal-token'
  );

-- Since anon access goes through edge functions (get-proposal, submit-proposal)
-- which use service_role key, the above policy won't block those flows.
-- But for direct anon queries, it prevents enumeration.
-- Actually, the edge functions use service_role which bypasses RLS entirely.
-- So we can safely make anon policies very restrictive.

-- Even simpler: just remove anon SELECT entirely since all anon access
-- goes through edge functions with service_role key
DROP POLICY IF EXISTS "proposal_select_anon_by_token" ON public.proposal_tokens;
-- No anon SELECT policy = anon cannot read proposal_tokens at all (default deny)

-- Remove anon UPDATE too — edge functions use service_role
DROP POLICY IF EXISTS "proposal_update_anon_by_token" ON public.proposal_tokens;
-- No anon UPDATE policy = anon cannot update proposal_tokens at all

-- 2. Fix project_tasks unrestricted UPDATE
DROP POLICY IF EXISTS "tasks_update_auth" ON public.project_tasks;

CREATE POLICY "tasks_update_auth"
  ON public.project_tasks FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()::text
    OR is_admin_or_higher()
  );
