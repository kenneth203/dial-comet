-- Create users table for system users (different from auth.users)
CREATE TABLE public.system_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Operator',
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

-- Create policies for system users
CREATE POLICY "Users can view all system users" 
ON public.system_users 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create system users" 
ON public.system_users 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own system user record" 
ON public.system_users 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete system users" 
ON public.system_users 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_system_users_updated_at
BEFORE UPDATE ON public.system_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();