-- Enable RLS on the permissions matrix view
ALTER TABLE public.v_permissions_matrix_secure ENABLE ROW LEVEL SECURITY;

-- Add policy to restrict access to admins only
CREATE POLICY "Admin only access to permissions matrix"
ON public.v_permissions_matrix_secure
FOR SELECT
USING (is_admin_or_higher());

-- Block all other operations (INSERT, UPDATE, DELETE) as this appears to be a view/read-only table
CREATE POLICY "Block permissions matrix modifications"
ON public.v_permissions_matrix_secure
FOR ALL
USING (false);