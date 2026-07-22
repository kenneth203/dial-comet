
CREATE OR REPLACE FUNCTION public.set_todo_completed(p_id uuid, p_completed boolean)
RETURNS public.todos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.todos;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_row FROM public.todos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  UPDATE public.todos
  SET completed = p_completed,
      updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_todo_completed(uuid, boolean) TO authenticated;
