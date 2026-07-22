
-- Lock down xero_connection: remove direct SELECT access; force access through SECURITY DEFINER RPCs only.
-- Table is currently empty and unreferenced by app code, so this is safe.

-- Drop all existing policies
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='xero_connection' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.xero_connection', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.xero_connection ENABLE ROW LEVEL SECURITY;

-- Revoke direct table privileges from application roles. Only service_role + SECURITY DEFINER RPCs may touch it.
REVOKE ALL ON public.xero_connection FROM anon, authenticated;
GRANT ALL ON public.xero_connection TO service_role;

-- Deny-all policy as defense-in-depth (no policy = no access under RLS, but make intent explicit)
CREATE POLICY "xero_connection_no_direct_access"
  ON public.xero_connection
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Secure read RPC: returns connection metadata WITHOUT tokens, Super-Admin only.
CREATE OR REPLACE FUNCTION public.get_xero_connection_metadata()
RETURNS TABLE(
  id uuid,
  tenant_id text,
  tenant_name text,
  connected_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT xc.id, xc.tenant_id, xc.tenant_name, xc.connected_at, xc.expires_at, xc.updated_at
  FROM public.xero_connection xc
  ORDER BY xc.updated_at DESC NULLS LAST
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_xero_connection_metadata() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_xero_connection_metadata() TO authenticated;
