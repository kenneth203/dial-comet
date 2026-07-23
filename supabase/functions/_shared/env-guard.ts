// Phase 0.5 Development Safety Hardening — shared environment guard.
// This Remix is permanently classified as `development`. The only accepted
// value for APP_ENV is the exact literal string "development"; anything else
// causes edge functions to fail closed with 503.

const APPROVED_DEV_ORIGINS: string[] = [
  'https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app',
];

export function isDevEnvironment(): boolean {
  return Deno.env.get('APP_ENV') === 'development';
}

export function envMisconfiguredResponse(reason = 'environment_misconfigured'): Response {
  return new Response(
    JSON.stringify({ error: reason, phase: '0.5-dev-hardening' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

export function disabledInDevResponse(fnName: string): Response {
  return new Response(
    JSON.stringify({
      error: 'disabled_in_dev',
      function: fnName,
      note: 'This function is disabled in the development Remix under Phase 0.5.',
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

// Guards the top of a Deno.serve handler. Returns a Response if the request
// must be rejected, otherwise null (continue).
export function assertDevEnvironment(): Response | null {
  const raw = Deno.env.get('APP_ENV');
  if (raw !== 'development') {
    console.warn('[env-guard] APP_ENV invalid or missing; failing closed', { present: raw !== undefined });
    return envMisconfiguredResponse();
  }
  return null;
}

// Returns the APP_PUBLIC_URL if present, valid and on the approved list.
// Throws otherwise. Callers building external links should catch and 503.
export function requireAppPublicUrl(): string {
  const url = Deno.env.get('APP_PUBLIC_URL');
  if (!url) throw new Error('APP_PUBLIC_URL not set');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('APP_PUBLIC_URL invalid'); }
  if (parsed.protocol !== 'https:') throw new Error('APP_PUBLIC_URL must be https');
  const origin = parsed.origin;
  if (!APPROVED_DEV_ORIGINS.includes(origin)) {
    throw new Error('APP_PUBLIC_URL origin not on approved dev list');
  }
  return origin;
}

// Safe version — returns null on any failure so callers can 503 uniformly.
export function safeAppPublicUrl(): string | null {
  try { return requireAppPublicUrl(); } catch { return null; }
}
