
-- 1) One-off cleanup: remove holiday approval notifications that have no matching pending request
DELETE FROM public.task_notifications tn
WHERE tn.type = 'holiday_approval'
  AND NOT EXISTS (
    SELECT 1
    FROM public.holiday_requests hr
    LEFT JOIN auth.users u ON u.id = hr.user_id
    WHERE hr.status = 'pending'
      AND (
        tn.message ILIKE '%' || COALESCE(u.email, '') || '%'
        OR tn.message ILIKE '%' || COALESCE(hr.user_id::text, '') || '%'
      )
  );

-- 2) Trigger to clean up approval notifications when a request leaves "pending"
CREATE OR REPLACE FUNCTION public.cleanup_holiday_approval_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  -- Resolve requester email (works for UPDATE and DELETE)
  SELECT email INTO v_email FROM auth.users WHERE id = COALESCE(OLD.user_id, NEW.user_id);

  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM 'pending') THEN
    DELETE FROM public.task_notifications
    WHERE type = 'holiday_approval'
      AND (
        (v_email IS NOT NULL AND message ILIKE '%' || v_email || '%')
        OR message ILIKE '%' || COALESCE(OLD.user_id, NEW.user_id)::text || '%'
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_holiday_approval_notifications ON public.holiday_requests;
CREATE TRIGGER trg_cleanup_holiday_approval_notifications
AFTER UPDATE OR DELETE ON public.holiday_requests
FOR EACH ROW EXECUTE FUNCTION public.cleanup_holiday_approval_notifications();
