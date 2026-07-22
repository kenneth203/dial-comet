DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'checklist_instances'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.checklist_instances';
  END IF;
END$$;

REVOKE SELECT (password_hash) ON public.document_shares FROM authenticated;
REVOKE SELECT (password_hash) ON public.document_shares FROM anon;

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_strictly())
  WITH CHECK (
    (auth.uid() = user_id OR public.is_admin_strictly())
    AND (
      public.is_admin_strictly()
      OR (
        role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
        AND status IS NOT DISTINCT FROM (SELECT p.status FROM public.profiles p WHERE p.user_id = auth.uid())
      )
    )
  );