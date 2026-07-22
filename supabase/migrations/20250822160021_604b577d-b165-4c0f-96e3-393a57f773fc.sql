-- Enable realtime for news_items table
ALTER TABLE public.news_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.news_items;