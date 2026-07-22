
-- 1. invoice-pdfs bucket: lock to is_admin_strictly()
DROP POLICY IF EXISTS "Admins can read invoice pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload invoice pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update invoice pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete invoice pdfs" ON storage.objects;

CREATE POLICY "Admins can read invoice pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.is_admin_strictly());

CREATE POLICY "Admins can upload invoice pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-pdfs' AND public.is_admin_strictly());

CREATE POLICY "Admins can update invoice pdfs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.is_admin_strictly())
  WITH CHECK (bucket_id = 'invoice-pdfs' AND public.is_admin_strictly());

CREATE POLICY "Admins can delete invoice pdfs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.is_admin_strictly());

-- 2. noticeboard-images: restrict read to authenticated users only
DROP POLICY IF EXISTS "Public read access for noticeboard images" ON storage.objects;

CREATE POLICY "Authenticated can read noticeboard images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'noticeboard-images');

-- 3. profiles: remove correlated sub-select; hard-block role/status changes via RLS
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_strictly())
  WITH CHECK (
    (auth.uid() = user_id OR public.is_admin_strictly())
    -- Non-admins cannot touch role/status at the policy level.
    -- Triggers still enforce this server-side as defence in depth.
  );

CREATE POLICY profiles_admin_update_any ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin_strictly())
  WITH CHECK (public.is_admin_strictly());
