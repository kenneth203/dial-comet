DO $$
DECLARE
  v_uid uuid := '570a1077-eb28-4a41-8c46-1bcafc311b01';
BEGIN
  DELETE FROM public.chat_message_reactions WHERE user_id = v_uid;
  DELETE FROM public.chat_message_reads WHERE user_id = v_uid;
  DELETE FROM public.chat_message_deliveries WHERE user_id = v_uid;
  DELETE FROM public.chat_messages WHERE sender_id = v_uid;
  DELETE FROM public.chat_room_members WHERE user_id = v_uid;
  DELETE FROM public.task_notifications WHERE user_id = v_uid OR created_by = v_uid;
  DELETE FROM public.task_attachments WHERE uploaded_by = v_uid;
  DELETE FROM public.todos WHERE assigned_to = v_uid OR created_by = v_uid;
  DELETE FROM public.user_statuses WHERE user_id = v_uid;
  DELETE FROM public.user_status WHERE user_id = v_uid;
  DELETE FROM public.user_preferences WHERE user_id = v_uid;
  DELETE FROM public.user_skills WHERE user_id = v_uid;
  DELETE FROM public.push_subscriptions WHERE user_id = v_uid;
  DELETE FROM public.holiday_requests WHERE user_id = v_uid;
  DELETE FROM public.holiday_requests_archive WHERE user_id = v_uid;
  DELETE FROM public.holiday_entitlements WHERE user_id = v_uid;
  DELETE FROM public.notification_preferences WHERE user_id = v_uid;
  DELETE FROM public.system_users WHERE user_id = v_uid;
  DELETE FROM public.profiles WHERE user_id = v_uid;
  DELETE FROM auth.users WHERE id = v_uid;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cleanup encountered: %', SQLERRM;
END $$;