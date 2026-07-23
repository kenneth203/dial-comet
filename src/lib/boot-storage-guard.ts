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

export function runBootStorageGuard(): { cleared: string[] } {
  const cleared: string[] = [];
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return { cleared };
  }

  const targetKey = projectAuthStorageKey();

  try {
    if (targetKey) {
      const raw = window.localStorage.getItem(targetKey);
      if (raw !== null && !isValidSession(raw)) {
        window.localStorage.removeItem(targetKey);
        cleared.push(targetKey);
      }
      return { cleared };
    }

    // No project ref available — fall back to scanning sb-*-auth-token keys.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(AUTH_KEY_PREFIX) || !key.endsWith(AUTH_KEY_SUFFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (raw !== null && !isValidSession(raw)) {
        window.localStorage.removeItem(key);
        cleared.push(key);
      }
    }
  } catch {
    // localStorage may throw in private modes — best-effort only.
  }

  return { cleared };
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
