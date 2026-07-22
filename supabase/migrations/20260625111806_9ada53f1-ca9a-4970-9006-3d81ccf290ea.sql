REVOKE ALL ON FUNCTION public.ensure_required_team_chat_rooms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_required_team_chat_memberships() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_user_to_general_chat_rooms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refill_required_team_chat_memberships() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.update_channel_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_channel_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_channel_members(uuid, uuid[]) TO service_role;