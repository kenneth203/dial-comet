-- Allow users to delete their own holiday requests (only pending or declined requests)
CREATE POLICY "Users can delete their own pending or declined requests" 
ON public.holiday_requests 
FOR DELETE 
USING (
  auth.uid() = user_id 
  AND status IN ('pending', 'declined')
);