-- Create user_status table for tracking user presence status
CREATE TABLE public.user_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'toilet', 'coffee', 'offline')),
  status_emoji TEXT NOT NULL DEFAULT '✅',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  auto_reset_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_statuses ENABLE ROW LEVEL SECURITY;

-- Create policies for user status
CREATE POLICY "Users can view all user statuses" 
ON public.user_statuses 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert their own status" 
ON public.user_statuses 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own status" 
ON public.user_statuses 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own status" 
ON public.user_statuses 
FOR DELETE 
USING (auth.uid() = user_id);

-- Function to auto-reset status after timeout
CREATE OR REPLACE FUNCTION public.reset_expired_statuses()
RETURNS void AS $$
BEGIN
  UPDATE public.user_statuses 
  SET status = 'online', 
      status_emoji = '✅',
      auto_reset_at = NULL,
      last_updated = now()
  WHERE auto_reset_at IS NOT NULL 
    AND auto_reset_at <= now();
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update last_updated timestamp
CREATE OR REPLACE FUNCTION public.update_user_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_status_updated_at
  BEFORE UPDATE ON public.user_statuses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_status_timestamp();

-- Enable realtime for user_statuses table
ALTER TABLE public.user_statuses REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_statuses;