ALTER TABLE public.holiday_requests_archive ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.holiday_requests_archive FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holiday_requests_archive TO authenticated;
GRANT ALL ON public.holiday_requests_archive TO service_role;

DROP POLICY IF EXISTS "Super-Admin can select holiday archive" ON public.holiday_requests_archive;
DROP POLICY IF EXISTS "Super-Admin can insert holiday archive" ON public.holiday_requests_archive;
DROP POLICY IF EXISTS "Super-Admin can update holiday archive" ON public.holiday_requests_archive;
DROP POLICY IF EXISTS "Super-Admin can delete holiday archive" ON public.holiday_requests_archive;

CREATE POLICY "Super-Admin can select holiday archive"
ON public.holiday_requests_archive FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super-Admin can insert holiday archive"
ON public.holiday_requests_archive FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super-Admin can update holiday archive"
ON public.holiday_requests_archive FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Super-Admin can delete holiday archive"
ON public.holiday_requests_archive FOR DELETE TO authenticated
USING (public.is_super_admin());