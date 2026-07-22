-- Enable real-time for holiday_requests table
ALTER TABLE public.holiday_requests REPLICA IDENTITY FULL;

-- Add the table to the realtime publication so changes are broadcast
ALTER PUBLICATION supabase_realtime ADD TABLE public.holiday_requests;