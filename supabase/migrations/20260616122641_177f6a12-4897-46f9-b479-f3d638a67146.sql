
-- Helper: resolve an assignee identifier (system_users.id, comprehensive_users.id,
-- or already-auth user_id) into the auth user id.
CREATE OR REPLACE FUNCTION public.resolve_auth_user_id(p_id text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uuid uuid;
  v_out uuid;
BEGIN
  IF p_id IS NULL OR btrim(p_id) = '' THEN RETURN NULL; END IF;
  BEGIN
    v_uuid := p_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  SELECT user_id INTO v_out FROM public.system_users WHERE id = v_uuid LIMIT 1;
  IF v_out IS NOT NULL THEN RETURN v_out; END IF;

  SELECT auth_user_id INTO v_out FROM public.comprehensive_users WHERE id = v_uuid LIMIT 1;
  IF v_out IS NOT NULL THEN RETURN v_out; END IF;

  -- Maybe the id is already an auth.users id
  SELECT id INTO v_out FROM auth.users WHERE id = v_uuid LIMIT 1;
  RETURN v_out;
END;
$$;

-- Helper: build a rich assignment message
CREATE OR REPLACE FUNCTION public.build_task_assignment_message(
  p_task_id uuid, p_assigner uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_customer text;
  v_internal boolean;
  v_assigner text;
BEGIN
  SELECT t.title, c.name, t.is_internal
    INTO v_title, v_customer, v_internal
    FROM public.project_tasks t
    LEFT JOIN public.customers c ON c.id = t.customer_id
    WHERE t.id = p_task_id;

  SELECT COALESCE(su.name, cu.name, 'Someone')
    INTO v_assigner
    FROM (SELECT 1) z
    LEFT JOIN public.system_users su ON su.user_id = p_assigner
    LEFT JOIN public.comprehensive_users cu ON cu.auth_user_id = p_assigner
    LIMIT 1;

  RETURN v_assigner
    || ' assigned you: '
    || COALESCE(v_title, 'Untitled task')
    || ' — '
    || COALESCE(NULLIF(v_customer, ''), CASE WHEN COALESCE(v_internal,false) THEN 'Internal' ELSE 'No client' END)
    || ' · '
    || to_char(now() AT TIME ZONE 'Europe/London', 'DD/MM/YYYY HH24:MI');
END;
$$;

-- Trigger function: insert a task_notifications row whenever assignee is set or changed
CREATE OR REPLACE FUNCTION public.handle_task_assignment_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_message text;
  v_assigner uuid := COALESCE(auth.uid(), NEW.created_by);
BEGIN
  IF NEW.assignee_id IS NULL OR btrim(NEW.assignee_id) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
    RETURN NEW;
  END IF;

  v_recipient := public.resolve_auth_user_id(NEW.assignee_id);
  IF v_recipient IS NULL THEN
    RAISE WARNING 'task assignment notify skipped: cannot resolve assignee % for task %', NEW.assignee_id, NEW.id;
    RETURN NEW;
  END IF;

  v_message := public.build_task_assignment_message(NEW.id, v_assigner);

  INSERT INTO public.task_notifications (user_id, task_id, message, type, is_read)
  VALUES (v_recipient, NEW.id, v_message, 'task_assigned', false);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignment_notify_ins ON public.project_tasks;
DROP TRIGGER IF EXISTS trg_task_assignment_notify_upd ON public.project_tasks;

CREATE TRIGGER trg_task_assignment_notify_ins
  AFTER INSERT ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignment_notify();

CREATE TRIGGER trg_task_assignment_notify_upd
  AFTER UPDATE OF assignee_id ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_assignment_notify();

-- Make the existing RPC a thin wrapper so old call sites still work but never double-insert.
-- It now does nothing if a row already exists for the same (recipient, task, type) within the last 5 seconds.
CREATE OR REPLACE FUNCTION public.notify_task_assignment(
  p_assignee_id uuid, p_task_id uuid, p_message text, p_type text DEFAULT 'task_assigned'::text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient uuid;
  v_id uuid;
  v_msg text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_assignee_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'assignee_null');
  END IF;

  v_recipient := public.resolve_auth_user_id(p_assignee_id::text);
  IF v_recipient IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'assignee_not_found');
  END IF;

  -- De-dupe with the trigger
  IF EXISTS (
    SELECT 1 FROM public.task_notifications
     WHERE user_id = v_recipient
       AND task_id = p_task_id
       AND type = COALESCE(p_type, 'task_assigned')
       AND created_at > now() - interval '10 seconds'
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'duplicate_recent');
  END IF;

  v_msg := CASE
    WHEN p_task_id IS NOT NULL THEN public.build_task_assignment_message(p_task_id, auth.uid())
    ELSE COALESCE(p_message, 'Task assigned')
  END;

  INSERT INTO public.task_notifications (user_id, task_id, message, type, is_read)
  VALUES (v_recipient, p_task_id, v_msg, COALESCE(p_type, 'task_assigned'), false)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('notification_id', v_id, 'recipient_id', v_recipient);
END;
$$;

-- Ensure realtime is publishing task_notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'task_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notifications';
  END IF;
END $$;
