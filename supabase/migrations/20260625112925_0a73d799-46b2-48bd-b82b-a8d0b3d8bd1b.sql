CREATE OR REPLACE FUNCTION public.update_todo_note_body(
  p_task_id uuid,
  p_note_created_at text,
  p_body text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := btrim(COALESCE(p_body, ''));
  v_notes text;
  v_lines text[];
  v_out text[] := ARRAY[]::text[];
  v_line text;
  v_is_header boolean;
  v_is_target boolean;
  v_in_target boolean := false;
  v_dropping_target boolean := false;
  v_found boolean := false;
  v_admin boolean;
  v_result text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to update notes.';
  END IF;

  IF COALESCE(btrim(p_note_created_at), '') = '' THEN
    RAISE EXCEPTION 'Note not found.';
  END IF;

  IF length(v_body) > 5000 THEN
    RAISE EXCEPTION 'Note is too long.';
  END IF;

  SELECT COALESCE(notes, '')
  INTO v_notes
  FROM public.todos
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found.';
  END IF;

  v_admin := public.is_super_admin();
  v_lines := string_to_array(v_notes, E'\n');

  FOREACH v_line IN ARRAY v_lines LOOP
    v_is_header := v_line ~ '^\[\[note:[^|]*\|[^|]*\|[^\]]*\]\]$';

    IF v_is_header THEN
      IF v_in_target THEN
        v_out := v_out || v_body;
        v_in_target := false;
      END IF;
      v_dropping_target := false;

      v_is_target := v_line LIKE ('[[note:%|%|' || p_note_created_at || ']]')
        AND (v_admin OR v_line LIKE ('[[note:' || v_uid::text || '|%|' || p_note_created_at || ']]'));

      IF v_is_target THEN
        v_found := true;
        IF v_body <> '' THEN
          v_out := v_out || v_line;
          v_in_target := true;
        ELSE
          v_dropping_target := true;
        END IF;
      ELSE
        v_out := v_out || v_line;
      END IF;
    ELSE
      IF NOT v_in_target AND NOT v_dropping_target THEN
        v_out := v_out || v_line;
      END IF;
    END IF;
  END LOOP;

  IF v_in_target THEN
    v_out := v_out || v_body;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'You can only edit your own notes.';
  END IF;

  v_result := btrim(array_to_string(v_out, E'\n'));

  UPDATE public.todos
  SET notes = v_result,
      updated_at = now()
  WHERE id = p_task_id
  RETURNING notes INTO v_notes;

  RETURN COALESCE(v_notes, '');
END;
$$;

REVOKE ALL ON FUNCTION public.update_todo_note_body(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_todo_note_body(uuid, text, text) TO authenticated, service_role;