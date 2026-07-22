
CREATE OR REPLACE FUNCTION public.enforce_checklist_contact_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_require boolean := false;
  v_min integer := 0;
  v_count integer := 0;
BEGIN
  -- Only enforce when transitioning INTO 'completed'
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.template_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(require_contact_names, false), COALESCE(min_contact_names, 3)
    INTO v_require, v_min
  FROM public.checklist_templates
  WHERE id = NEW.template_id;

  IF NOT v_require THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cardinality(ARRAY(
    SELECT n FROM unnest(COALESCE(NEW.contact_names, ARRAY[]::text[])) AS n
    WHERE btrim(n) <> ''
  )), 0) INTO v_count;

  IF v_count < v_min THEN
    RAISE EXCEPTION 'At least % contact name(s) required before completing this task (got %).', v_min, v_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_checklist_contact_names ON public.checklist_instances;
CREATE TRIGGER trg_enforce_checklist_contact_names
BEFORE INSERT OR UPDATE OF status, contact_names ON public.checklist_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_checklist_contact_names();
