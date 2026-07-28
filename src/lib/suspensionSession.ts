// Temporary, non-sensitive display state used by the public
// /account-suspended page after the Supabase session has been signed out.
//
// Only the minimum information required to render the screen is stored:
// reason, when the suspension started and (optionally) when it ends.
// Never store tokens, user ids, emails or full database records here.

const SUSPENSION_DISPLAY_KEY = 'vateam.suspension.display';

export interface SuspensionDisplayState {
  reason: string | null;
  state_entered_at: string | null;
  suspend_until: string | null;
}

export function setSuspensionDisplayState(state: SuspensionDisplayState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SUSPENSION_DISPLAY_KEY,
      JSON.stringify({
        reason: state.reason ?? null,
        state_entered_at: state.state_entered_at ?? null,
        suspend_until: state.suspend_until ?? null,
      }),
    );
  } catch {
    /* storage unavailable — the page falls back to a generic message */
  }
}

export function getSuspensionDisplayState(): SuspensionDisplayState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SUSPENSION_DISPLAY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      state_entered_at:
        typeof parsed.state_entered_at === 'string' ? parsed.state_entered_at : null,
      suspend_until: typeof parsed.suspend_until === 'string' ? parsed.suspend_until : null,
    };
  } catch {
    return null;
  }
}

export function hasSuspensionDisplayState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SUSPENSION_DISPLAY_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSuspensionDisplayState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SUSPENSION_DISPLAY_KEY);
  } catch {
    /* ignore */
  }
}
