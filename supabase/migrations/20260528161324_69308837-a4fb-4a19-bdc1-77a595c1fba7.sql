
-- 1) Pin search_path on email queue functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- 2) Make invoice-pdfs bucket private and remove broad public read policy
UPDATE storage.buckets SET public = false WHERE id = 'invoice-pdfs';
DROP POLICY IF EXISTS "Public read invoice pdfs" ON storage.objects;
