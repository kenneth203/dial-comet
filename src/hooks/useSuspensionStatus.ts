// Single integration seam for app-layer suspension enforcement.
//
// Today this reads the `get_my_suspension_status()` RPC (self-only, derived
// from auth.uid()). A future Edge Function can replace `fetchSuspensionStatus`
// without any change to the UI or business logic.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { asPromise } from '@/lib/supabaseRpc';
import { withTimeout } from '@/lib/withTimeout';
import {
  setSuspensionDisplayState,
  clearSuspensionDisplayState,
} from '@/lib/suspensionSession';

const SUSPENSION_CHECK_TIMEOUT_MS = 8_000;

export interface SuspensionStatus {
  /** Stored database state, e.g. 'active' | 'suspended' | ... */
  state: string;
  reason: string | null;
  state_entered_at: string | null;
  suspend_until: string | null;
  /** Computed effective status (lazy expiry applied, no database write). */
  is_suspended: boolean;
}

const ACTIVE_STATUS: SuspensionStatus = {
  state: 'active',
  reason: null,
  state_entered_at: null,
  suspend_until: null,
  is_suspended: false,
};

/** Resolve the current user's suspension status. Throws on network/timeout failure. */
export async function fetchSuspensionStatus(): Promise<SuspensionStatus> {
  const { data, error } = await withTimeout<{ data: any; error: any }>(
    asPromise(supabase.rpc('get_my_suspension_status')),
    SUSPENSION_CHECK_TIMEOUT_MS,
    'get_my_suspension_status',
  );

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return ACTIVE_STATUS;

  return {
    state: typeof row.state === 'string' ? row.state : 'active',
    reason: row.reason ?? null,
    state_entered_at: row.state_entered_at ?? null,
    suspend_until: row.suspend_until ?? null,
    is_suspended: row.is_suspended === true,
  };
}

/**
 * Stores the minimum display information, then signs the Supabase session out.
 * Callers should navigate to /account-suspended *before* awaiting this so the
 * suspended screen never depends on authenticated data.
 */
export async function beginSuspendedSession(status: SuspensionStatus): Promise<void> {
  setSuspensionDisplayState({
    reason: status.reason,
    state_entered_at: status.state_entered_at,
    suspend_until: status.suspend_until,
  });
  try {
    await supabase.auth.signOut();
  } catch {
    /* the session is already unusable — the suspended screen still renders */
  }
}

export type SuspensionPhase = 'resolving' | 'active' | 'suspended' | 'error';

export interface UseSuspensionStatusResult {
  phase: SuspensionPhase;
  status: SuspensionStatus | null;
  retry: () => void;
}

/**
 * Enforcement hook used by ProtectedRoute. While `phase === 'resolving'`
 * protected content must stay blocked. On failure the caller must show a
 * bounded error state with Retry — never an endless spinner and never a
 * false "Account Suspended".
 */
export function useSuspensionStatus(userId: string | null | undefined): UseSuspensionStatusResult {
  const [phase, setPhase] = useState<SuspensionPhase>(userId ? 'resolving' : 'active');
  const [status, setStatus] = useState<SuspensionStatus | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setPhase('resolving');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setPhase('active');
      setStatus(null);
      return;
    }

    setPhase('resolving');
    fetchSuspensionStatus()
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        if (result.is_suspended) {
          setPhase('suspended');
        } else {
          clearSuspensionDisplayState();
          setPhase('active');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[useSuspensionStatus] check failed:', error?.name ?? error);
        setPhase('error');
      });

    // Re-check on session refresh so a suspension applied mid-session is
    // enforced without requiring a full reload.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') setAttempt((n) => n + 1);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [userId, attempt]);

  return { phase, status, retry };
}
