
CREATE TABLE public.task_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  task_title text NOT NULL,
  task_id text NOT NULL,
  customer_name text,
  assignee_name text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  received_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.task_notifications
FOR SELECT
TO authenticated
USING (auth.uid() = recipient_user_id);

-- Users can update their own notifications (mark as read/received)
CREATE POLICY "Users can update own notifications"
ON public.task_notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_user_id)
WITH CHECK (auth.uid() = recipient_user_id);

-- Authenticated users can create notifications
CREATE POLICY "Authenticated users can create notifications"
ON public.task_notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = sender_user_id);

-- Admins can view all notifications
CREATE POLICY "Admins can view all notifications"
ON public.task_notifications
FOR SELECT
TO authenticated
USING (is_admin_or_higher());
