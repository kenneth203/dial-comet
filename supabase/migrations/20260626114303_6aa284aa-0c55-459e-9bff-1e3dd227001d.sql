CREATE OR REPLACE FUNCTION public.clear_finished_task_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'checklist_instances' THEN
    IF NEW.status IN ('completed', 'skipped', 'not_applicable') THEN
      UPDATE public.task_notifications
         SET is_read = true
       WHERE is_read = false
         AND (related_id = NEW.id OR task_id = NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'project_tasks' THEN
    IF NEW.status = 'completed'
       AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN
      UPDATE public.task_notifications
         SET is_read = true
       WHERE is_read = false
         AND task_id = NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'todos' THEN
    IF COALESCE(NEW.completed, false) = true
       AND COALESCE(OLD.completed, false) IS DISTINCT FROM true THEN
      UPDATE public.task_notifications
         SET is_read = true
       WHERE is_read = false
         AND task_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;