// Emergency loading-repair — boot storage guard.
//
// Runs synchronously at startup, BEFORE the Supabase client reads localStorage,
// so a corrupted persisted session cannot leave `supabase.auth.getSession()`
// deadlocked. Removes ONLY the specific project's malformed auth-storage
// entry; never touches unrelated keys.

const AUTH_KEY_PREFIX = 'sb-';
const AUTH_KEY_SUFFIX = '-auth-token';

function deriveProjectRef(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return null;
    const host = new URL(url).hostname; // e.g. abcd.supabase.co
    const ref = host.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}

export function projectAuthStorageKey(): string | null {
  const ref = deriveProjectRef();
  return ref ? `${AUTH_KEY_PREFIX}${ref}${AUTH_KEY_SUFFIX}` : null;
}

function isValidSession(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    // Supabase persists either { currentSession, expiresAt } or a Session shape.
    // Accept any parseable JSON object; the client will re-validate.
    return true;
  } catch {
    return false;
  }
}

export function runBootStorageGuard(): { cleared: string[]; skipped: boolean } {
  const cleared: string[] = [];
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return { cleared, skipped: true };
  }

  const targetKey = projectAuthStorageKey();

  // If the exact project-scoped key cannot be derived (missing / invalid
  // VITE_SUPABASE_URL) we DO NOT delete anything. The main.tsx config screen
  // will render instead, and the user can clear the scoped session manually
  // once configuration is restored.
  if (!targetKey) {
    return { cleared, skipped: true };
  }

  try {
    const raw = window.localStorage.getItem(targetKey);
    if (raw !== null && !isValidSession(raw)) {
      window.localStorage.removeItem(targetKey);
      cleared.push(targetKey);
    }
  } catch {
    // localStorage may throw in private modes — best-effort only.
  }

  return { cleared, skipped: false };
}


export function clearProjectAuthStorage(): void {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  const key = projectAuthStorageKey();
  try {
    if (key) window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
