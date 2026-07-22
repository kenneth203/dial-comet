CREATE OR REPLACE FUNCTION public.notify_task_assignment(p_assignee_id uuid, p_task_id uuid, p_message text, p_type text DEFAULT 'task_assigned'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipient_auth_id uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_assignee_id IS NULL OR p_message IS NULL THEN
    RAISE EXCEPTION 'Assignee and message are required';
  END IF;

  SELECT user_id INTO v_recipient_auth_id
  FROM public.system_users
  WHERE id = p_assignee_id
  LIMIT 1;

  IF v_recipient_auth_id IS NULL THEN
    SELECT auth_user_id INTO v_recipient_auth_id
    FROM public.comprehensive_users
    WHERE id = p_assignee_id
    LIMIT 1;
  END IF;

  IF v_recipient_auth_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'assignee_not_found');
  END IF;

  -- Self-assignment now produces a notification too, so the assigner sees it
  -- on their own dashboard instantly.
  INSERT INTO public.task_notifications (user_id, task_id, message, type, is_read)
  VALUES (v_recipient_auth_id, p_task_id, p_message, COALESCE(p_type, 'task_assigned'), false)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('notification_id', v_id, 'recipient_id', v_recipient_auth_id);
END;
$function$;