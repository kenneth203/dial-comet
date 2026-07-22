
-- 1) Prevent profile role self-escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_role_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin_or_higher() THEN
      RAISE EXCEPTION 'Only administrators can change user roles';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_admin_or_higher() THEN
      RAISE EXCEPTION 'Only administrators can change user status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_role_self_change ON public.profiles;
CREATE TRIGGER profiles_block_role_self_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_self_change();

-- 2) Proposal tokens: restrict SELECT/UPDATE to creator or admin
DROP POLICY IF EXISTS proposal_select_auth ON public.proposal_tokens;
DROP POLICY IF EXISTS proposal_update_auth ON public.proposal_tokens;

CREATE POLICY proposal_select_owner_or_admin
ON public.proposal_tokens
FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR public.is_admin_or_higher());

CREATE POLICY proposal_update_owner_or_admin
ON public.proposal_tokens
FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR public.is_admin_or_higher())
WITH CHECK (created_by = auth.uid() OR public.is_admin_or_higher());

-- 3) Form submissions: restrict SELECT to admins; tighten anon insert to require existing active template
DROP POLICY IF EXISTS form_sub_select_auth ON public.form_submissions;
DROP POLICY IF EXISTS form_sub_insert_anon ON public.form_submissions;

CREATE POLICY form_sub_select_admin
ON public.form_submissions
FOR SELECT
TO authenticated
USING (public.is_admin_or_higher());

CREATE POLICY form_sub_insert_anon_validated
ON public.form_submissions
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.form_templates ft
    WHERE ft.id = form_submissions.form_template_id
      AND ft.is_active = true
  )
);

-- 4) Chat room members: only room creator or admin can add members
DROP POLICY IF EXISTS chat_members_insert_auth ON public.chat_room_members;

CREATE POLICY chat_members_insert_creator_or_admin
ON public.chat_room_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_higher()
  OR EXISTS (
    SELECT 1 FROM public.chat_rooms cr
    WHERE cr.id = chat_room_members.room_id
      AND cr.created_by = auth.uid()
  )
);
