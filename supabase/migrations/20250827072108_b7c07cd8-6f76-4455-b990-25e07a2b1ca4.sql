-- Enable real-time updates for news_items table
-- This ensures that real-time subscriptions work properly for the News Feed

-- Set replica identity to FULL to capture complete row data during updates
ALTER TABLE public.news_items REPLICA IDENTITY FULL;

-- Add the table to the supabase_realtime publication to activate real-time functionality
ALTER PUBLICATION supabase_realtime ADD TABLE public.news_items;

-- Ensure user_statuses table also has real-time enabled for status changes
ALTER TABLE public.user_statuses REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_statuses;