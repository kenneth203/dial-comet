ALTER TABLE public.task_notifications
  ADD COLUMN IF NOT EXISTS related_id uuid;

CREATE INDEX IF NOT EXISTS task_notifications_related_id_idx
  ON public.task_notifications (related_id)
  WHERE related_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_task_notification(
  p_recipient_id uuid,
  p_task_id uuid,
  p_message text,
  p_type text DEFAULT 'task_assigned',
  p_related_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_recipient_id IS NULL OR p_message IS NULL OR p_type IS NULL THEN
    RAISE EXCEPTION 'recipient, message and type are required';
  END IF;

  INSERT INTO public.task_notifications (user_id, task_id, message, type, related_id)
  VALUES (p_recipient_id, p_task_id, p_message, p_type, p_related_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_holiday_approval_notifications(
  p_request_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_request_id IS NULL THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE public.task_notifications
     SET is_read = true
   WHERE related_id = p_request_id
     AND type = 'holiday_approval'
     AND is_read = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_holiday_approval_notifications(uuid) TO authenticated;