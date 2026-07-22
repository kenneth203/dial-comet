SET LOCAL session_replication_role = 'replica';
DELETE FROM public.profiles WHERE user_id = '570a1077-eb28-4a41-8c46-1bcafc311b01';
DELETE FROM auth.users WHERE id = '570a1077-eb28-4a41-8c46-1bcafc311b01';
SET LOCAL session_replication_role = 'origin';