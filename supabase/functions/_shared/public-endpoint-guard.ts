// Phase 0.5 — feature-flag-controlled guard for public endpoints
// (get-form, submit-form, get-proposal, submit-proposal, create-proposal-token).
//
// Flag: DEV_PUBLIC_ENDPOINT_GUARD (exact values: "enabled" | "disabled")
//   - unset  => treated as "enabled" (fail-safe default)
//   - "enabled" => requires x-dev-test-token header equal to DEV_PUBLIC_ENDPOINT_TOKEN
//   - "disabled" => header check skipped, all other Phase 0.5 protections remain
//   - any other value => fail closed with 503 environment_misconfigured

let LOGGED = false;

export function assertPublicEndpointAllowed(req: Request): Response | null {
  const flagRaw = Deno.env.get('DEV_PUBLIC_ENDPOINT_GUARD');
  const flag = flagRaw ?? 'enabled';
  if (!LOGGED) {
    console.log('[public-endpoint-guard] cold-start effective flag', { flag });
    LOGGED = true;
  }
  if (flag !== 'enabled' && flag !== 'disabled') {
    return new Response(
      JSON.stringify({ error: 'environment_misconfigured', detail: 'DEV_PUBLIC_ENDPOINT_GUARD invalid' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (flag === 'disabled') return null;

  const expected = Deno.env.get('DEV_PUBLIC_ENDPOINT_TOKEN');
  if (!expected) {
    return new Response(
      JSON.stringify({ error: 'environment_misconfigured', detail: 'DEV_PUBLIC_ENDPOINT_TOKEN missing' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const provided = req.headers.get('x-dev-test-token');
  if (!provided || provided !== expected) {
    return new Response(
      JSON.stringify({ error: 'dev_token_required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return null;
}
