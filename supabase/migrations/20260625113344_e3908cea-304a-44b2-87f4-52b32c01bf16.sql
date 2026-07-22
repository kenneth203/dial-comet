CREATE OR REPLACE FUNCTION public.save_checklist_instance_note(
  p_id uuid,
  p_notes text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_result text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to save notes.';
  END IF;

  IF length(COALESCE(v_notes, '')) > 5000 THEN
    RAISE EXCEPTION 'Note is too long.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.checklist_instances WHERE id = p_id) THEN
    RAISE EXCEPTION 'Checklist item not found.';
  END IF;

  UPDATE public.checklist_instances
  SET completion_notes = v_notes,
      updated_at = now()
  WHERE id = p_id
  RETURNING completion_notes INTO v_result;

  INSERT INTO public.checklist_logs(instance_id, user_id, action, notes)
  VALUES (p_id, v_uid, 'note_saved', v_notes);

  RETURN COALESCE(v_result, '');
END;
$$;

REVOKE ALL ON FUNCTION public.save_checklist_instance_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_checklist_instance_note(uuid, text) TO authenticated, service_role;