# Phase 0.5 — Development Safety Hardening Plan v1.2

Changes from v1.1: the public endpoint token guard is now controlled by a development feature flag rather than being permanently hard-coded. All other v1.1 amendments remain in force.

Scope: harden this Remix so it cannot reach production customers, staff, inboxes, webhooks, AI providers, or third-party services. No feature work. No schema, migration, RLS, permission, table, or role changes. No user creation. No seed data insertion in this phase — design only.

---

## 0. Environment Classification (binding)

- This Remix is permanently classified as **development**.
- `APP_ENV` (Edge Function secret) and `VITE_APP_ENV` (client build) are fixed to the exact literal `development`.
- Shared helpers `assertDevEnvironment()` (Edge) and `useIsDevEnvironment()` (client) treat any other value — missing, empty, differently-cased, or anything else — as invalid and fail closed:
  - Edge Functions return `503 environment_misconfigured`.
  - Client renders a full-screen block screen instead of the app.
- Rollback never instructs anyone to set either variable to `production` or to unset them.

## 1. Global Development Banner

- `DevEnvironmentBanner` at the top of `AppShell` and above `/auth`; visible on every route.
- Full-width `bg-destructive`, white text, fixed top, `z-[100]`, `role="status"`, ~28px. Text: `DEVELOPMENT ENVIRONMENT — NOT PRODUCTION · Outbound email, webhooks and third-party calls are blocked`.
- Renders only when `VITE_APP_ENV === 'development'`; any other value triggers the §0 block screen.
- Adjust topbar/main padding for banner height.
- Hook injects `[DEV] ` prefix into `document.title` on every route.

## 2. Development-Only Email Safety

Central guard; fail closed.

- `supabase/functions/_shared/email-guard.ts` exports `assertEmailAllowed(candidateRecipients)` and `isDevEnvironment()`.
- Requires `APP_ENV === 'development'`.
- `DEV_EMAIL_ALLOWLIST` is a comma-separated list of **exact email addresses only**. Domain-only entries are rejected at parse time and treated as empty.
- Normalise (trim + lowercase) and compare for exact equality.
- Checked surfaces: `to`, `cc`, `bcc`, `reply_to`, and SMTP envelope recipient(s). Any address not on the allowlist blocks the entire send. No silent stripping. No redirection to an allowed inbox.
- Empty / missing / invalid allowlist ⇒ every send blocked.
- Overlay block-list: any address matching `kenneth@thevateam.co.uk` or ending in `@thevateam.co.uk` is refused even if allowlisted.
- Wired into: `send-transactional-email`, `auth-email-hook`, `process-email-queue`, `process-invoice-reminders`, `inbound-email` (reply path), `parse-lead-email`, `retry-inbound-emails`, `reassign-kate-requests`, `handle-email-suppression`, `handle-email-unsubscribe`.
- `send-transactional-email` adds `[DEV] ` subject prefix and a "Sent from development environment" footer when the guard permits a send.
- Remove hard-coded `kenneth@thevateam.co.uk` and `@thevateam.co.uk` recipients; replace with `DEV_NOTIFICATIONS_TO` (itself validated through the allowlist).

## 3. Replace Production URLs In Development Emails

- `APP_PUBLIC_URL` set explicitly to the confirmed Remix preview origin (`https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app`).
- Must be present, a valid `https://` URL, and match an internal approved-origins list. Any failure ⇒ `503 environment_misconfigured`. No localhost fallback in the deployed Remix.
- Sweep `_shared/email-templates/**`, `_shared/transactional-email-templates/**`, and functions `create-proposal-token`, `submit-proposal`, `get-proposal`, `submit-form`, `get-form`, `handle-email-unsubscribe`, `inbound-email` for `portal.thevateam.co.uk`, `thevateam.co.uk`, and prod Supabase URLs; replace with `APP_PUBLIC_URL`.
- Repo-local check script greps for prod hostnames and fails on operational references.

## 4. Authentication Safety and Identity Reconciliation

- Reconciliation: v1.0's reference to `kenneth@thevateam.co.uk` as an existing bootstrap account is inconsistent with the earlier audit's `auth.users` count of zero. Phase 0.5 does not depend on that account.
  - Read-only verification against `auth.users` for that address before sign-off. If present, remove via a confirmed deletion path (§10 amendment 9); never recreate.
  - No production email identity is created, reused, or left present in this Remix.
- Supabase auth for this Remix permits only:
  - The confirmed Remix preview origin from §3
  - `http://localhost:8080`
- Remove any `portal.thevateam.co.uk` (or other production URL) from the Remix's Site URL and Redirect URLs. Production Supabase project is not touched.
- `auth-email-hook` runs through §2 guard.
- Auth templates rebranded: `[DEV Operations Workspace]` subject prefix, "Development environment" header badge, disclaimer body copy, `siteName` = `Operations Workspace (DEV)`.

## 5. Outbound Edge Function Review

"Guarded" = keep code, wrap with `assertDevEnvironment()` + specific guard. "Disabled" = early-return `503 disabled_in_dev`. "Unchanged" = no external side effects. AI-capable functions are Disabled for Phase 0.5 regardless of `LOVABLE_API_KEY` presence (v1.1 amendment 2).

| Function | Capability | Phase 0.5 disposition |
|---|---|---|
| `send-transactional-email` | Email | Guarded |
| `auth-email-hook` | Email | Guarded |
| `process-email-queue` | Email HTTP send | Guarded (final pre-send check) |
| `handle-email-suppression` | Inbound webhook | Guarded (ingress accepted; outbound blocked) |
| `handle-email-unsubscribe` | Email link handler | Unchanged (local DB; uses `APP_PUBLIC_URL`) |
| `preview-transactional-email` | Renders only | Unchanged |
| `process-invoice-reminders` | Email + schedule | **Disabled** |
| `inbound-email` | Inbound webhook + email reply | Guarded (ingress accepted; outbound blocked) |
| `retry-inbound-emails` | Email | **Disabled** |
| `parse-lead-email` | Email + AI | **Disabled** |
| `reassign-kate-requests` | Email | **Disabled** |
| `poll-gmail-dictations` | Google API | **Disabled** |
| `generate-script-ai` | AI | **Disabled** |
| `get-google-maps-key` | Google Maps key vend | Guarded (503 when key unset; keep) |
| `github-status` | GitHub API | **Disabled** |
| `create-proposal-token` | Public link generation | Guarded (see Public Endpoint Guard below) |
| `get-proposal` / `submit-proposal` | Public-facing | Guarded (no outbound notification in dev) |
| `get-form` / `submit-form` | Public form endpoints | Guarded (no outbound notification in dev) |
| `encrypt-financial-data` | Local crypto | Unchanged |
| `admin-create-user` | Auth admin | Unchanged (Super-Admin gated); unused in Phase 0.5 |

### Public Endpoint Guard (revised in v1.2 — feature-flag controlled)

The `x-dev-test-token` guard on public endpoints (`get-form`, `submit-form`, `get-proposal`, `submit-proposal`, `create-proposal-token`) is now controlled by a development feature flag rather than being permanently hard-coded.

- **Flag**: `DEV_PUBLIC_ENDPOINT_GUARD` — Edge Function secret. Accepted exact values: `enabled`, `disabled`. Default when unset: `enabled` (fail-safe default).
- **When `enabled`** (default):
  - Each listed endpoint requires request header `x-dev-test-token` equal to `DEV_PUBLIC_ENDPOINT_TOKEN`.
  - Missing/mismatched token ⇒ `403 dev_token_required`.
  - `DEV_PUBLIC_ENDPOINT_TOKEN` unset ⇒ `503 environment_misconfigured` (fail closed rather than opening up).
- **When `disabled`**:
  - The token header check is skipped.
  - All other Phase 0.5 protections remain in force: `APP_ENV`/`VITE_APP_ENV` gating, the §2 email guard (so no outbound notification), `APP_PUBLIC_URL` origin check for generated links, and the disabled/guarded classifications above.
  - Disabling this flag does **not** re-enable AI, does **not** widen the email allowlist, and does **not** allow production URLs.
- **Any other value** (including empty string, mixed case, unknown token) ⇒ treated as invalid and fails closed with `503 environment_misconfigured`, matching the strict-value pattern used elsewhere in this plan.
- Flag state is logged (name + value only, no secrets) at function cold start so its effective setting is auditable.
- The flag lives alongside other Phase 0.5 secrets (§6) and can be toggled without a code change; flipping it does not require redeploy of the Edge Functions if only the secret value changes.

## 6. Environment Variables

Fixed (must equal `development`):

- `APP_ENV`
- `VITE_APP_ENV`

Required for Phase 0.5:

- `APP_PUBLIC_URL` — confirmed Remix preview origin
- `LOVABLE_API_KEY` — present because platform-managed; presence does not grant permission to call AI in Phase 0.5

Required when `DEV_PUBLIC_ENDPOINT_GUARD` is `enabled` (the default):

- `DEV_PUBLIC_ENDPOINT_TOKEN` — random string used by the public endpoint guard

Optional (feature-flag / opt-in):

- `DEV_PUBLIC_ENDPOINT_GUARD` — `enabled` (default) or `disabled`; anything else = fail closed
- `DEV_EMAIL_ALLOWLIST` — comma-separated exact addresses only
- `DEV_NOTIFICATIONS_TO` — single exact address; must also appear in the allowlist

Production-only — must remain UNSET in this Remix:

- `INBOUND_EMAIL_SECRET`
- `POLL_GMAIL_CRON_SECRET`
- `GOOGLE_MAPS_API_KEY` (unless a dev-only key is separately approved)
- Any Gmail OAuth tokens / Google service credentials
- Any GitHub API token
- Any Xero credentials
- Any Stripe / payment provider secret
- Any production webhook signing secret

Verification: `fetch_secrets` after hardening shows only the fixed, required, and explicitly approved optional entries. Anything else blocks Phase 0.5 sign-off.

## 7. Development Test Accounts (design only)

Per v1.1 amendment 3, no accounts are created in Phase 0.5. Design constraints for later phases:

- UI/state-only identities use non-deliverable local addresses (e.g. `test-a@invalid.localhost`). No `.dev.local` (v1.1 amendment 6). No `@thevateam.co.uk`. No real customer addresses.
- Authentication-email testing uses a separately approved controlled inbox or sandbox address that has been explicitly added to `DEV_EMAIL_ALLOWLIST`.
- Role assignment deferred until Phase 1 confirms authoritative role values.

## 8. Development Seed Dataset (design only)

Per v1.1 amendment 7, no seed data inserted in Phase 0.5. Design:

- No schema changes; no assumption of a `source` column.
- Local seed manifest (JSON) outside the DB: table name, PK values, timestamp, Remix project ref captured at insert time.
- Insertion (deferred): script writes rows and appends to the manifest.
- Cleanup (deferred): verifies current project ref matches manifest ref, then deletes strictly by PK. No `TRUNCATE`, no broad predicate deletes.
- Content design: 3 dev customers, obviously fake addresses, `test-N@invalid.localhost` contacts, no NI numbers, no bank details, encrypted fields null.

## 9. Verification Checklist

1. `VITE_APP_ENV=development` ⇒ banner visible on `/auth`, `/`, deep route. Any other value ⇒ block screen.
2. `APP_ENV=development` ⇒ Edge Functions accept invocations. Any other value ⇒ every guarded function returns `503 environment_misconfigured`.
3. `fetch_secrets` matches §6.
4. Empty `DEV_EMAIL_ALLOWLIST` ⇒ every attempted send blocked with `email_blocked_dev_environment`.
5. Single exact address in the allowlist ⇒ only that address deliverable; domain-only entries rejected at parse time.
6. Any `@thevateam.co.uk` recipient ⇒ blocked even if allowlisted.
7. `process-invoice-reminders`, `retry-inbound-emails`, `reassign-kate-requests`, `poll-gmail-dictations`, `github-status`, `generate-script-ai`, `parse-lead-email` each return `503 disabled_in_dev`.
8. Grep for `portal.thevateam.co.uk`, `@thevateam.co.uk`, prod Supabase URLs. Per v1.1 amendment 12, distinguish operational references (must be zero) from branding assets (allowed only if separately identified and justified; preferred action: copy the asset into this Remix and reference the dev-safe copy).
9. Auth email preview shows `[DEV]` prefix and disclaimer; `siteName` reads `Operations Workspace (DEV)`.
10. Supabase auth Site URL and Redirect URLs contain only the Remix preview origin and `http://localhost:8080`.
11. `auth.users` contains no `@thevateam.co.uk` identity; if one existed at Phase 0.5 start it has been removed via a confirmed deletion path.
12. Public endpoint guard behaviour:
    - `DEV_PUBLIC_ENDPOINT_GUARD` unset (default `enabled`): requests to public endpoints without `x-dev-test-token` ⇒ `403 dev_token_required`; with correct token ⇒ works; `DEV_PUBLIC_ENDPOINT_TOKEN` unset ⇒ `503 environment_misconfigured`.
    - `DEV_PUBLIC_ENDPOINT_GUARD=disabled`: requests without the header succeed, but any resulting email is still blocked by §2 and any generated link still uses `APP_PUBLIC_URL`.
    - `DEV_PUBLIC_ENDPOINT_GUARD` set to any other value ⇒ `503 environment_misconfigured`.
    - Cold-start log line records the effective flag value.
13. `APP_PUBLIC_URL` unset or not on the approved-origins list ⇒ any function that builds an external link returns `503 environment_misconfigured`.

## 10. Rollback Procedure

Rollback never sets `APP_ENV` or `VITE_APP_ENV` to `production` and never unsets them.

1. **Feature-level rollback**: revert individual commits (banner, guards, disable blocks). `APP_ENV`/`VITE_APP_ENV` stay `development`.
2. **Public endpoint guard**:
   - To temporarily bypass the token check without a code change, set `DEV_PUBLIC_ENDPOINT_GUARD=disabled`.
   - To re-enable, set it to `enabled` or unset it (default is `enabled`).
   - To disable the endpoints entirely, unset `DEV_PUBLIC_ENDPOINT_TOKEN` while the guard is `enabled` ⇒ endpoints fail closed with `503 environment_misconfigured`.
3. **Email allowlist rollback**: clear `DEV_EMAIL_ALLOWLIST` ⇒ sends blocked. Or revert the guard commit.
4. **Test account cleanup**: Phase 0.5 creates no accounts. Any later cleanup uses only deletion methods confirmed to exist in this Remix at that time; `admin-create-user` is not documented as a deletion path here (v1.1 amendment 9).
5. **Seed data cleanup**: Phase 0.5 inserts no seed rows. Any later cleanup uses the manifest-driven, project-ref-verified delete described in §8. No broad truncation.
6. **Auth redirect rollback**: reapply the prior redirect URL list from source control via `supabase--configure_auth`. Production Supabase project is never modified.

No migrations, RLS, tables, or permissions are touched by this phase; rollback is limited to code and Edge Function secrets in this Remix.
