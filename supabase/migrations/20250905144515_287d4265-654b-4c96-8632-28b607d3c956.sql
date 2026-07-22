-- Add missing foreign key constraint between document_shares and profiles
ALTER TABLE public.document_shares
ADD CONSTRAINT document_shares_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);

-- Add foreign key for shared_by field as well
ALTER TABLE public.document_shares
ADD CONSTRAINT document_shares_shared_by_fkey 
FOREIGN KEY (shared_by) REFERENCES public.profiles(user_id);