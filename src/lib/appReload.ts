// Centralised reload/navigation helper with sanitised diagnostics.
//
// Every project-owned reload/navigation-to-current-route MUST go through
// `appReload`. This persists the last reason so it survives the reload and
// can be surfaced by `recordBootStart()` on the next boot.
//
// Never log tokens, emails, user ids, session objects or private data.

const REASON_KEY = 'app:last-reload';
const BOOT_TS_KEY = 'app:boot-ts';

export type ReloadReason =
  | 'version-check-toast'
  | 'chunk-load-error'
  | 'watchdog-reload'
  | 'watchdog-recover'
  | 'error-boundary-reload'
  | 'error-boundary-recover'
  | 'static-failsafe-reload'
  | 'static-failsafe-recover'
  | 'user-manual';

export interface ReloadContext {
  reason: ReloadReason;
  source: string;
  navigateTo?: string;
}

export function appReload(ctx: ReloadContext): void {
  try {
    const payload = {
      reason: ctx.reason,
      source: ctx.source,
      ts: Date.now(),
      route: typeof window !== 'undefined' ? window.location.pathname : '',
    };
    window.sessionStorage.setItem(REASON_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
  console.warn('[appReload]', ctx.reason, 'from', ctx.source);
  if (ctx.navigateTo) {
    window.location.replace(ctx.navigateTo);
  } else {
    window.location.reload();
  }
}

export interface BootDiagnostics {
  bootTs: number;
  navType: string;
  previous: null | { reason: string; source: string; ts: number; route: string; ageMs: number };
}

export function recordBootStart(): BootDiagnostics {
  const bootTs = Date.now();
  let previous: BootDiagnostics['previous'] = null;
  try {
    const raw = window.sessionStorage.getItem(REASON_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        previous = {
          reason: String(parsed.reason ?? 'unknown'),
          source: String(parsed.source ?? 'unknown'),
          ts: Number(parsed.ts ?? 0),
          route: String(parsed.route ?? ''),
          ageMs: bootTs - Number(parsed.ts ?? bootTs),
        };
      }
      window.sessionStorage.removeItem(REASON_KEY);
    }
    window.sessionStorage.setItem(BOOT_TS_KEY, String(bootTs));
  } catch { /* ignore */ }

  let navType = 'unknown';
  try {
    const entries = performance.getEntriesByType?.('navigation') as
      | PerformanceNavigationTiming[]
      | undefined;
    if (entries && entries[0]) navType = entries[0].type;
  } catch { /* ignore */ }

  const diag: BootDiagnostics = { bootTs, navType, previous };
  console.info('[boot]', {
    ts: new Date(bootTs).toISOString(),
    navType,
    previousReload: previous
      ? { reason: previous.reason, source: previous.source, ageMs: previous.ageMs }
      : null,
  });
  return diag;
}

export function attachLifecycleDiagnostics(): void {
  if (typeof window === 'undefined') return;
  const log = (event: string, extra?: Record<string, unknown>) =>
    console.info('[lifecycle]', event, extra ?? {});
  document.addEventListener('visibilitychange', () =>
    log('visibilitychange', { state: document.visibilityState }),
  );
  window.addEventListener('online', () => log('online'));
  window.addEventListener('offline', () => log('offline'));
  window.addEventListener('pageshow', (e) =>
    log('pageshow', { persisted: (e as PageTransitionEvent).persisted }),
  );
  window.addEventListener('pagehide', (e) =>
    log('pagehide', { persisted: (e as PageTransitionEvent).persisted }),
  );
  window.addEventListener('beforeunload', () => log('beforeunload'));
}
