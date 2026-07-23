## Symptom
On `/auth` (and `/`) in the Lovable preview iframe you see only a spinner on a white background — this is the inline `.critical-loading` div in `index.html`. React never boots, so `main.tsx` never clears it, so the spinner stays forever. In a fresh headless browser hitting the sandbox dev server directly, the sign-in form renders fine and there are no console/network errors.

## Root cause
`index.html` ships a hard-coded `<meta http-equiv="Content-Security-Policy">` tuned for the *production* domain. In the Lovable preview iframe it blocks the extra scripts/frames/websockets Lovable injects around the app (lovable-tagger runtime, preview messaging, HMR socket on `*.lovable.app`), which prevents the React bundle from executing to completion — so the fallback spinner is all you ever see.

`index.html` also contains a `dns-prefetch` pointing at the old production Supabase project ref and an absolute `og:image` on `portal.thevateam.co.uk` — stale from the remix source, unrelated to the load failure but worth clearing at the same time.

Scope reminder: this is purely a frontend / `index.html` change. No migrations, RLS, permissions, edge functions, or Cloud config are touched. Nothing gets published.

## Plan

1. **Loosen the CSP in `index.html` so the preview iframe can render.**
   - Remove the `<meta http-equiv="Content-Security-Policy">` tag from `index.html`. The production site should set CSP at the hosting/edge layer (response header), not inline in the HTML shipped to every environment — the meta form has no way to vary between "prod domain", "Lovable preview iframe", and "sandbox dev", which is what caused this.
   - If you'd rather keep a meta CSP for defense in depth, the alternative is to widen it to also allow `https://cdn.gpteng.co` in `script-src`, `https://*.lovable.app https://*.lovable.dev` in `frame-src`/`frame-ancestors`, and `wss://*.lovable.app` in `connect-src`. Removal is simpler and matches what most Lovable projects ship.

2. **Clean up stale prod references in the `<head>`.**
   - Remove the `<link rel="dns-prefetch" href="https://wszjasdcxoznryykhwll.supabase.co">` line (old production project ref; the current Cloud URL is already read from `import.meta.env`).
   - Replace the absolute `og:image` / `twitter:image` (`https://portal.thevateam.co.uk/va-team-logo.png`) with either the same asset served from `/` on the current origin, or drop the tag — Lovable hosting will inject a preview image at publish time.

3. **Verify.**
   - After the edits, flush the HMR gate and reload the preview iframe.
   - Confirm `/auth` renders the sign-in form (no more perpetual spinner) and `/` redirects to `/auth` because there's no session.
   - Check the browser Console for zero CSP violation errors.

## Technical details

- Files touched: `index.html` only.
- No changes to `src/`, no changes to Supabase / Cloud, no changes to `supabase/` migrations, no publish.
- If step 1 turns out not to be sufficient (e.g. the spinner persists after removing the meta CSP), the next diagnostic step is to open DevTools in the preview iframe, capture the actual Console error, and iterate — but the CSP is the highest-probability cause given (a) the sandbox renders fine, (b) the only thing between "React boots" and "spinner forever" is a script-load failure, and (c) the CSP is the only known thing in `index.html` that behaves differently between the local sandbox and the Lovable preview wrapping.