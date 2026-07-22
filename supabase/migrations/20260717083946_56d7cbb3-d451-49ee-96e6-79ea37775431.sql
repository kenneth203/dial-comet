
CREATE TABLE public.banner_rotation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  timezone text NOT NULL DEFAULT 'Europe/London',
  rotation_hour smallint NOT NULL DEFAULT 8 CHECK (rotation_hour >= 0 AND rotation_hour <= 23),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.banner_rotation_settings TO anon, authenticated;
GRANT UPDATE, INSERT ON public.banner_rotation_settings TO authenticated;
GRANT ALL ON public.banner_rotation_settings TO service_role;

ALTER TABLE public.banner_rotation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banner_rotation_settings_select_all"
  ON public.banner_rotation_settings FOR SELECT
  USING (true);

CREATE POLICY "banner_rotation_settings_write_superadmin"
  ON public.banner_rotation_settings FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TRIGGER banner_rotation_settings_updated_at
  BEFORE UPDATE ON public.banner_rotation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.banner_rotation_settings (singleton, timezone, rotation_hour)
VALUES (true, 'Europe/London', 8)
ON CONFLICT (singleton) DO NOTHING;
