// UI affordance gate for the suspension controls.
//
// Reuses the *exact* database authorisation predicate
// (`public.can_manage_user_suspension()` — Active Super-Admin, the same check
// performed by `reserve_user_suspension`). No role-name guessing in the client.
// The database remains the final authority on every call.

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { asPromise } from '@/lib/supabaseRpc';

export function useCanManageSuspension(): { canManage: boolean; loading: boolean } {
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await asPromise<any>(supabase.rpc('can_manage_user_suspension'));
      if (cancelled) return;
      setCanManage(!error && data === true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { canManage, loading };
}
