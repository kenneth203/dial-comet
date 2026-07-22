-- Allow admins to delete any holiday requests (including approved ones)
CREATE POLICY "Admins can delete any holiday request" 
ON public.holiday_requests 
FOR DELETE 
USING (is_admin_or_higher());