-- Create noticeboard table for storing rich text content
CREATE TABLE public.noticeboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.noticeboard ENABLE ROW LEVEL SECURITY;

-- Create policies for noticeboard
CREATE POLICY "Anyone can view noticeboard content" 
ON public.noticeboard 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Admin and Supervisor can insert noticeboard content" 
ON public.noticeboard 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
);

CREATE POLICY "Admin and Supervisor can update noticeboard content" 
ON public.noticeboard 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
);

CREATE POLICY "Admin and Supervisor can delete noticeboard content" 
ON public.noticeboard 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_noticeboard_updated_at
  BEFORE UPDATE ON public.noticeboard
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default noticeboard content
INSERT INTO public.noticeboard (content) VALUES ('
<p><strong>Useful Information</strong></p>
<ul>
  <li>The coffee machine takes pound coins only.</li>
  <li>Bins emptied every Wednesday; keep desks clear at shift end.</li>
  <li>For software issues, email support@example.com.</li>
</ul>
<p>Welcome to the VA Team dashboard!</p>
');