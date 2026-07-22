-- Remove the ineffective PERMISSIVE false policy that provides no actual protection
DROP POLICY IF EXISTS "staff_details_block_all_direct_access" ON public.staff_details;