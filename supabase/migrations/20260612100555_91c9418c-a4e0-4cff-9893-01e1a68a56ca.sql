
-- 1) Limit noticeboard-images uploads to admins/supervisors (matches edit perms)
DROP POLICY IF EXISTS "Authenticated users can upload noticeboard images" ON storage.objects;
CREATE POLICY "Admins can upload noticeboard images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'noticeboard-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('Super-Admin', 'Admin', 'Supervisor')
  )
);

-- 2) Stop password_hash from being SELECT-able by clients via PostgREST.
-- Column-level privilege revoke combines with RLS so SELECT * still works for
-- other columns; only password_hash becomes inaccessible from client SQL.
REVOKE SELECT (password_hash) ON public.document_shares FROM authenticated;
REVOKE SELECT (password_hash) ON public.document_shares FROM anon;

-- 3) Remove project_tasks and todos from the Realtime publication so their
-- row contents are not broadcast to all authenticated subscribers.
ALTER PUBLICATION supabase_realtime DROP TABLE public.project_tasks;
ALTER PUBLICATION supabase_realtime DROP TABLE public.todos;
