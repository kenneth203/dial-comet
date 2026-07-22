-- Set replica identity to FULL to capture complete row data during updates
-- This ensures real-time subscriptions receive all necessary data
ALTER TABLE public.news_items REPLICA IDENTITY FULL;
ALTER TABLE public.user_statuses REPLICA IDENTITY FULL;