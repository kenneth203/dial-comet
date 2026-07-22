-- Create status timing logs table to track when users start/stop toilet and coffee breaks
CREATE TABLE public.status_timing_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('toilet', 'coffee')),
  action TEXT NOT NULL CHECK (action IN ('start', 'end')),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.status_timing_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert their own timing logs" 
ON public.status_timing_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all timing logs" 
ON public.status_timing_logs 
FOR SELECT 
USING (is_admin_or_higher());

CREATE POLICY "Users can view their own timing logs" 
ON public.status_timing_logs 
FOR SELECT 
USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX idx_status_timing_logs_user_timestamp ON public.status_timing_logs(user_id, timestamp);
CREATE INDEX idx_status_timing_logs_status_action ON public.status_timing_logs(status, action, timestamp);