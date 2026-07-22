-- Add unique constraint on user_id to prevent multiple profiles
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- Replace the vulnerable INSERT policy with one that ONLY allows Operator role
DROP POLICY IF EXISTS "profiles_authenticated_insert_operator_only" ON public.profiles;

CREATE POLICY "profiles_insert_operator_only"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'Operator'::user_role
  );