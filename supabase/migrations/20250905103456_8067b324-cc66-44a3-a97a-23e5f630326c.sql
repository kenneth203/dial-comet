-- Allow authenticated users to create shift templates (not just admins)
DROP POLICY IF EXISTS "Admins can manage shift templates" ON public.shift_templates;

-- Create more granular policies
CREATE POLICY "Authenticated users can insert shift templates" 
ON public.shift_templates 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update shift templates" 
ON public.shift_templates 
FOR UPDATE 
USING (is_admin_or_higher());

CREATE POLICY "Admins can delete shift templates" 
ON public.shift_templates 
FOR DELETE 
USING (is_admin_or_higher());

CREATE POLICY "Authenticated users can view shift templates" 
ON public.shift_templates 
FOR SELECT 
USING (auth.uid() IS NOT NULL);