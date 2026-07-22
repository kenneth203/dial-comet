
CREATE OR REPLACE FUNCTION public.create_task_notification(
  p_recipient_id uuid,
  p_task_id uuid,
  p_message text,
  p_type text DEFAULT 'task_assigned'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_recipient_id IS NULL OR p_message IS NULL THEN
    RAISE EXCEPTION 'Recipient and message are required';
  END IF;

  -- Don't notify yourself
  IF p_recipient_id = auth.uid() THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.task_notifications (user_id, task_id, message, type, is_read)
  VALUES (p_recipient_id, p_task_id, p_message, COALESCE(p_type, 'task_assigned'), false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text) TO authenticated;
