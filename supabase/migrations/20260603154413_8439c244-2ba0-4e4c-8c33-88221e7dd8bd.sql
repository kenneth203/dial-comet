
CREATE OR REPLACE FUNCTION public.validate_holiday_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('approved','declined','cancelled') THEN
    NULL;
  ELSE
    IF NOT public.is_admin_or_higher() THEN
      RAISE EXCEPTION 'Invalid holiday request status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status IN ('approved','declined') AND OLD.status = 'pending' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_holiday_status_transition ON public.holiday_requests;
CREATE TRIGGER trg_validate_holiday_status_transition
BEFORE UPDATE OF status ON public.holiday_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_holiday_status_transition();

CREATE OR REPLACE FUNCTION public.cleanup_holiday_approval_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_uid uuid;
BEGIN
  v_uid := COALESCE(OLD.user_id, NEW.user_id);
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending') THEN
    DELETE FROM public.task_notifications
    WHERE type = 'holiday_approval'
      AND (
        (v_email IS NOT NULL AND message ILIKE '%' || v_email || '%')
        OR message ILIKE '%' || v_uid::text || '%'
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_holiday_approval_notifications ON public.holiday_requests;
CREATE TRIGGER trg_cleanup_holiday_approval_notifications
AFTER UPDATE OR DELETE ON public.holiday_requests
FOR EACH ROW EXECUTE FUNCTION public.cleanup_holiday_approval_notifications();

DELETE FROM public.task_notifications tn
WHERE tn.type = 'holiday_approval'
  AND NOT EXISTS (
    SELECT 1
    FROM public.holiday_requests hr
    LEFT JOIN auth.users u ON u.id = hr.user_id
    WHERE hr.status = 'pending'
      AND (
        (u.email IS NOT NULL AND tn.message ILIKE '%' || u.email || '%')
        OR tn.message ILIKE '%' || hr.user_id::text || '%'
      )
  );
