-- Remove duplicate required team channels, keeping the oldest row for each required channel name
WITH ranked_required_rooms AS (
  SELECT id,
         row_number() OVER (PARTITION BY lower(coalesce(name, '')) ORDER BY created_at ASC, id ASC) AS rn
  FROM public.chat_rooms
  WHERE type = 'general'
    AND lower(coalesce(name, '')) IN ('general', 'typist')
)
DELETE FROM public.chat_rooms r
USING ranked_required_rooms ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- Ensure required team channel names cannot be duplicated again
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_required_team_chat_rooms
ON public.chat_rooms ((lower(coalesce(name, ''))))
WHERE type = 'general'
  AND lower(coalesce(name, '')) IN ('general', 'typist');

-- Ensure the required team-wide channels exist without creating duplicates
CREATE OR REPLACE FUNCTION public.ensure_required_team_chat_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  SELECT su.user_id INTO v_creator
  FROM public.system_users su
  WHERE su.user_id IS NOT NULL
  ORDER BY su.created_at NULLS LAST
  LIMIT 1;

  IF v_creator IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_rooms (name, type, created_by, is_private)
  SELECT 'General', 'general', v_creator, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE type = 'general' AND lower(coalesce(name, '')) = 'general'
  );

  INSERT INTO public.chat_rooms (name, type, created_by, is_private)
  SELECT 'Typist', 'general', v_creator, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_rooms
    WHERE type = 'general' AND lower(coalesce(name, '')) = 'typist'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_required_team_chat_memberships()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_required_team_chat_rooms();

  INSERT INTO public.chat_room_members (room_id, user_id)
  SELECT r.id, su.user_id
  FROM public.chat_rooms r
  CROSS JOIN public.system_users su
  WHERE r.type = 'general'
    AND lower(coalesce(r.name, '')) IN ('general', 'typist')
    AND su.user_id IS NOT NULL
    AND lower(coalesce(su.status, 'active')) = 'active'
  ON CONFLICT (room_id, user_id) DO NOTHING;
END;
$$;

SELECT public.ensure_required_team_chat_memberships();