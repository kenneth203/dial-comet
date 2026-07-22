
CREATE OR REPLACE FUNCTION public.verify_dashboard_permissions()
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  expected_select_tables text[] := ARRAY['todos','project_tasks','checklist_instances','checklist_logs'];
  t text;
  has_open_select boolean;
  has_restricted_write boolean;
BEGIN
  FOREACH t IN ARRAY expected_select_tables LOOP
    -- Team-wide SELECT
    SELECT EXISTS(
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='SELECT' AND qual='true'
    ) INTO has_open_select;
    check_name := t || ' team-wide read';
    status := CASE WHEN has_open_select THEN 'PASS' ELSE 'FAIL' END;
    detail := CASE WHEN has_open_select
      THEN 'All authenticated users can read'
      ELSE 'Missing open SELECT policy' END;
    RETURN NEXT;

    -- Restricted write (UPDATE or DELETE must NOT be USING(true))
    SELECT NOT EXISTS(
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND cmd IN ('UPDATE','DELETE') AND qual='true'
    ) INTO has_restricted_write;
    check_name := t || ' write restricted';
    status := CASE WHEN has_restricted_write THEN 'PASS' ELSE 'FAIL' END;
    detail := CASE WHEN has_restricted_write
      THEN 'Edits/deletes scoped to owner/assignee/admin'
      ELSE 'Write policy is too permissive' END;
    RETURN NEXT;

    -- RLS enabled
    check_name := t || ' RLS enabled';
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity) THEN
      status := 'PASS'; detail := 'Row level security on';
    ELSE
      status := 'FAIL'; detail := 'RLS is disabled';
    END IF;
    RETURN NEXT;

    -- Realtime publication
    check_name := t || ' realtime';
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      status := 'PASS'; detail := 'Published to realtime';
    ELSE
      status := 'FAIL'; detail := 'Not in supabase_realtime publication';
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_dashboard_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_dashboard_permissions() TO authenticated, service_role;
