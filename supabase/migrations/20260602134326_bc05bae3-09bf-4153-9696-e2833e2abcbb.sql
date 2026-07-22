
DROP FUNCTION IF EXISTS public.create_task_notification(uuid, uuid, text, text);

-- 1. Event type catalog
CREATE TABLE public.notification_event_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  sort_order int NOT NULL DEFAULT 100,
  email_default boolean NOT NULL DEFAULT true,
  push_default boolean NOT NULL DEFAULT false,
  in_app_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_event_types TO authenticated;
GRANT ALL ON public.notification_event_types TO service_role;

ALTER TABLE public.notification_event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY net_select_auth ON public.notification_event_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY net_admin_write ON public.notification_event_types
  FOR ALL TO authenticated
  USING (public.is_admin_or_higher())
  WITH CHECK (public.is_admin_or_higher());

INSERT INTO public.notification_event_types (key, label, description, category, sort_order, email_default, push_default) VALUES
  ('task_assigned', 'Task assigned to me', 'When another team member assigns a task to you.', 'tasks', 10, true, false),
  ('task_mention', 'I am @mentioned', 'When someone mentions you in a task or note.', 'tasks', 20, true, false),
  ('task_comment', 'New comment on my task', 'When someone comments on a task assigned to you.', 'tasks', 30, false, false),
  ('holiday_request_submitted', 'Holiday request to approve', 'When a team member submits a holiday request you can approve.', 'holidays', 40, true, false),
  ('holiday_request_decision', 'My holiday request decision', 'When your holiday request is approved or rejected.', 'holidays', 50, true, false),
  ('invoice_ready', 'Invoice ready', 'When a new invoice is ready for you to review or send.', 'billing', 60, true, false),
  ('invoice_review', 'Invoice needs review', 'Admin alert when an auto-generated invoice needs review.', 'billing', 70, true, false),
  ('chat_dm', 'New direct message', 'When a teammate sends you a direct chat message.', 'chat', 80, false, true),
  ('noticeboard_post', 'New noticeboard post', 'When a new company-wide noticeboard post is published.', 'company', 90, false, false),
  ('daily_handover_stale', 'Stale daily handover', 'When a daily handover has not been updated.', 'company', 100, false, false);

-- 2. Per-user preferences
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL REFERENCES public.notification_event_types(key) ON DELETE CASCADE,
  in_app boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT true,
  push boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

CREATE INDEX idx_notif_prefs_user ON public.notification_preferences(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY np_select_self_or_admin ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_higher());

CREATE POLICY np_insert_self ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_higher());

CREATE POLICY np_update_self ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_higher())
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_higher());

CREATE POLICY np_delete_self ON public.notification_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_higher());

CREATE TRIGGER np_set_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Push subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ps_select_self ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_higher());

CREATE POLICY ps_insert_self ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY ps_delete_self ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_higher());

-- 4. Channel-resolving helper
CREATE OR REPLACE FUNCTION public.get_notification_channels(
  p_recipient_id uuid,
  p_event_type text
)
RETURNS TABLE(in_app boolean, email boolean, push boolean, recipient_email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref record;
  v_def record;
  v_email text;
BEGIN
  SELECT * INTO v_def FROM public.notification_event_types WHERE key = p_event_type;
  SELECT * INTO v_pref FROM public.notification_preferences
    WHERE user_id = p_recipient_id AND event_type = p_event_type;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_recipient_id;

  in_app := COALESCE(v_pref.in_app, v_def.in_app_default, true);
  email  := COALESCE(v_pref.email,  v_def.email_default,  true);
  push   := COALESCE(v_pref.push,   v_def.push_default,   false);
  recipient_email := v_email;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_notification_channels(uuid, text) TO authenticated;

-- 5. Recreate create_task_notification with jsonb return so dispatcher can fan out
CREATE OR REPLACE FUNCTION public.create_task_notification(
  p_recipient_id uuid,
  p_task_id uuid,
  p_message text,
  p_type text DEFAULT 'task_assigned'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_channels record;
  v_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_recipient_id IS NULL OR p_message IS NULL THEN
    RAISE EXCEPTION 'Recipient and message are required';
  END IF;

  IF p_recipient_id = auth.uid() THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'self');
  END IF;

  SELECT * INTO v_channels FROM public.get_notification_channels(p_recipient_id, COALESCE(p_type, 'task_assigned'));

  IF COALESCE(v_channels.in_app, true) THEN
    INSERT INTO public.task_notifications (user_id, task_id, message, type, is_read)
    VALUES (p_recipient_id, p_task_id, p_message, COALESCE(p_type, 'task_assigned'), false)
    RETURNING id INTO v_id;
  END IF;

  SELECT label INTO v_label FROM public.notification_event_types WHERE key = COALESCE(p_type, 'task_assigned');

  RETURN jsonb_build_object(
    'notification_id', v_id,
    'in_app', COALESCE(v_channels.in_app, true),
    'email', COALESCE(v_channels.email, true),
    'push', COALESCE(v_channels.push, false),
    'recipient_email', v_channels.recipient_email,
    'event_label', COALESCE(v_label, COALESCE(p_type, 'Notification'))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text) TO authenticated;
