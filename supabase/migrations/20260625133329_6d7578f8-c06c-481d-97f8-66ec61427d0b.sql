REVOKE EXECUTE ON FUNCTION public.clear_finished_task_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_finished_task_notifications() TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text, uuid) TO authenticated, service_role;