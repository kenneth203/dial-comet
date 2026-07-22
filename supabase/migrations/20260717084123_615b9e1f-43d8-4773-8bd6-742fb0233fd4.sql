
ALTER TABLE public.banner_rotation_settings
  ADD COLUMN IF NOT EXISTS manual_index integer,
  ADD COLUMN IF NOT EXISTS manual_set_at timestamptz;

ALTER PUBLICATION supabase_realtime ADD TABLE public.banner_rotation_settings;
ALTER TABLE public.banner_rotation_settings REPLICA IDENTITY FULL;
