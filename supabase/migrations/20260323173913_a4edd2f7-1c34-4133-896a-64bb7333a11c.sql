
-- Allow all authenticated users to view all notifications (shared team dashboard)
CREATE POLICY "All authenticated users can view notifications"
ON public.task_notifications
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);
