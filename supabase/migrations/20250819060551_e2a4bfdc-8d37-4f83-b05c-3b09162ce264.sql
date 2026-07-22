-- Update noticeboard RLS policy to require authentication
DROP POLICY IF EXISTS "Anyone can view noticeboard content" ON public.noticeboard;

CREATE POLICY "Authenticated users can view noticeboard content" 
ON public.noticeboard 
FOR SELECT 
USING (auth.uid() IS NOT NULL);