
CREATE TABLE public.dashboard_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_banners TO authenticated;
GRANT ALL ON public.dashboard_banners TO service_role;

ALTER TABLE public.dashboard_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active banners"
  ON public.dashboard_banners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super-Admin can insert banners"
  ON public.dashboard_banners FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super-Admin can update banners"
  ON public.dashboard_banners FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super-Admin can delete banners"
  ON public.dashboard_banners FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

CREATE TRIGGER trg_dashboard_banners_updated_at
  BEFORE UPDATE ON public.dashboard_banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for the dashboard-banners bucket
CREATE POLICY "Signed-in users can read banner files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'dashboard-banners');

CREATE POLICY "Super-Admin can upload banner files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'dashboard-banners' AND public.is_super_admin());

CREATE POLICY "Super-Admin can update banner files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'dashboard-banners' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'dashboard-banners' AND public.is_super_admin());

CREATE POLICY "Super-Admin can delete banner files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'dashboard-banners' AND public.is_super_admin());
