-- Fix 1 & 4: Restrict SELECT on comprehensive_users and staff_details to admins only.
-- Owners must read their own sensitive data via audited SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "comp_users_select_own_or_admin" ON public.comprehensive_users;
CREATE POLICY "comp_users_select_admin_only"
ON public.comprehensive_users
FOR SELECT
TO authenticated
USING (public.is_admin_or_higher());

DROP POLICY IF EXISTS "staff_details_select_admin" ON public.staff_details;
CREATE POLICY "staff_details_select_admin_only"
ON public.staff_details
FOR SELECT
TO authenticated
USING (public.is_admin_or_higher());

-- Fix 2: Restrict holiday_entitlements SELECT to owner or admin
-- (user_id stores system_users.id; map via system_users)
DROP POLICY IF EXISTS "holiday_ent_select_auth" ON public.holiday_entitlements;
CREATE POLICY "holiday_ent_select_own_or_admin"
ON public.holiday_entitlements
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_higher()
  OR user_id = auth.uid()
  OR user_id IN (SELECT id FROM public.system_users WHERE user_id = auth.uid())
);

-- Fix 3: Defense-in-depth WITH CHECK on profiles UPDATE to prevent role/status escalation
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.is_admin_or_higher()
    OR (
      role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
      AND status = (SELECT status FROM public.profiles WHERE user_id = auth.uid())
    )
  )
);