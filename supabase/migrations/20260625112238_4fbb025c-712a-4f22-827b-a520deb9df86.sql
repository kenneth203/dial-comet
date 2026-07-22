REVOKE ALL ON FUNCTION public.sync_checklist_instance_team_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_checklist_instance_team_status() FROM anon;
REVOKE ALL ON FUNCTION public.sync_checklist_instance_team_status() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_checklist_instance_team_status() TO service_role;

REVOKE ALL ON FUNCTION public.complete_checklist_instance(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_checklist_instance(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_checklist_instance(uuid, text) TO authenticated, service_role;