# Development Synchronisation Sprint 1 — Completion Report

**Project:** Remix / Development environment (`8b31b9e2-c03e-432c-8f58-7a093ded151c`)  
**Date:** 30 July 2026  
**Scope:** Port six production hotfixes from Live into Development. No redesign, no refactor, no React Query migration, no file moves or renames, no unrelated cleanup.  
**Environment:** Development / remix only. Nothing was published to Live.  

This document establishes the new Development baseline following Sprint 1 synchronisation.

---

## 1. Database migrations applied

Migrations ran in the order listed below. Sprint 1 introduced **no destructive schema changes**. Migrations were additive except for the removal of the temporary `customer_directory` view, which was immediately replaced by the production `get_customer_directory()` RPC as part of the synchronisation. No production data was removed or altered.

### 1.1 Chat stability — `20260730075052_a530c87d-f181-4af2-b642-3d33c049abc7.sql`

- `public.mark_chat_room_read(p_room_id uuid) RETURNS integer` — `VOLATILE`, `SECURITY DEFINER`, sets read receipts for all unread messages in a room in one call.
- `public.get_chat_unread_counts() RETURNS TABLE(room_id uuid, unread_count bigint)` — `STABLE`, `SECURITY DEFINER`, returns per-room unread counts for the current user.
- Revoked `EXECUTE` on both functions from `PUBLIC` and `anon`; granted to `authenticated`.
- Added indexes:
  - `idx_chat_messages_room_sender_id` on `public.chat_messages (room_id, sender_id, id)`
  - `idx_chat_message_reads_user_message` on `public.chat_message_reads (user_id, message_id)`

### 1.2 Recurring invoice extras + security hotfixes — `20260730080001_ede3cb02-9afb-489e-8ed0-9e57e98532a2.sql`

- Added `extra_line_items jsonb NOT NULL DEFAULT '[]'::jsonb` to `public.recurring_invoice_schedules`.
- Replaced `public.generate_due_recurring_invoices()`:
  - Enforces `is_admin_or_higher()` when called by an authenticated user (service role still allowed).
  - Computes `v_extra_total` from `extra_line_items` and adds extra lines to the generated `proposal_invoices.line_items` array.
  - Subtotal, VAT and total include the extra-line total.
  - Revoked `EXECUTE` from `anon`/`PUBLIC`; granted to `authenticated` and `service_role`.
- Security hotfixes on `public.inbound_email_log`:
  - SELECT restricted to `is_admin_or_higher()`.
  - INSERT/UPDATE/DELETE policies for `authenticated` explicitly deny all rows (`USING (false)` / `WITH CHECK (false)`); writes remain service-role only.
- Security hotfixes on `storage.objects` for the database export bucket:
  - Four admin-only policies scoped to `bucket_id = 'database_export_22_07_26'` and `is_admin_or_higher()` for SELECT/INSERT/UPDATE/DELETE.

### 1.3 Unified invoice reporting + customer directory RPC — `20260730080037_c4206001-f3a4-4251-bd9b-49e4957740d2.sql`

- Created `public.invoices_unified` view combining:
  - `proposal_invoices` → source `crm`
  - `internal_invoices` (with `internal_billing_periods`) → source `billing`
  - `billing_invoices` (deduplicated against internal invoices) → source `legacy_billing`
- Created `public.get_invoice_report(p_from date, p_to date)` — `STABLE`, `SECURITY DEFINER`, gated by `has_billing_access()`.
- Revoked `ALL` on `get_invoice_report` from `PUBLIC`/`anon`; granted to `authenticated` and `service_role`.
- Dropped the temporary `public.customer_directory` view.
- Created `public.get_customer_directory()` — `STABLE`, `SECURITY DEFINER`, returns `id, name, status, account_id` for `public.customers`, requires `auth.uid() IS NOT NULL`.
- Revoked `ALL` on `get_customer_directory` from `PUBLIC`/`anon`; granted to `authenticated` and `service_role`.
- Hardened `public.invoices_unified`:
  - Set `security_invoker = on`.
  - Revoked direct `SELECT` from `PUBLIC`, `anon`, and `authenticated`; granted `SELECT` only to `service_role`.

---

## 2. Files changed

### Item 1 — Chat stability

| File | Change |
|------|--------|
| `src/components/chat/MessagesList.tsx` | Removed the per-message `IntersectionObserver` read-receipt batch-flush machinery and its `data-message-id`/`data-sender-id` refs. Kept the bottom-sentinel observer, `useMessageReactions`, and auto-scroll behaviour. |
| `src/hooks/useChatUnread.ts` | Replaced the membership → messages → read-receipts three-query calculation with a single `get_chat_unread_counts()` RPC call. Kept the realtime channel, UUID channel-name strategy, optimistic increment, and notification ping. |
| `src/hooks/useChat.ts` | `markAsRead` now calls `mark_chat_room_read` with request de-duplication; `sendMessage` returns an explicit `boolean`; its catch block detects auth-class failures (`PGRST301`, jwt/auth/permission/RLS) and shows a "Session expired" toast. |
| `src/components/chat/ChatPanel.tsx` | Stopped firing read receipts on every message change. Read receipts now trigger only on room open/switch. |
| `src/components/chat/MessageComposer.tsx` | `onSend` prop now returns `Promise<boolean \| void>`; `handleSend` is async and clears the input only when the send resolves true, so failed sends preserve the user's text. |
| `src/pages/Chat.tsx` | `handleSendMessage` returns the result of `sendMessage`. |
| `src/context/AuthContext.tsx` | Merged `isRefreshTokenFailure()` (matches `refresh_token_not_found` / `refresh_token_already_used`) and `forceReauth()` (clears all `sb-*-auth-token` keys from `localStorage` and `sessionStorage`, signs out, redirects to `/auth`). Wired into session bootstrap and the unhandled-rejection path. `forceReauth()` is guarded by `hasSuspensionDisplayState()` to avoid redirect conflict with the suspension flow. |

### Item 2 — Customer directory RPC

All six call sites switched from `supabase.from('customers')` or `customer_directory` queries to `supabase.rpc('get_customer_directory')`. Client-side sort replaces `.order()`; `.find()` replaces `.maybeSingle()`.

| File | Change |
|------|--------|
| `src/components/checklist/ChecklistTemplateBuilder.tsx` | Customer lookup now uses `get_customer_directory()`. |
| `src/components/config/EmailIntakeRules.tsx` | Customer lookup now uses `get_customer_directory()`. |
| `src/components/config/EmailRoutingAuditLog.tsx` | Customer lookup now uses `get_customer_directory()`. |
| `src/components/dashboard/DailyChecklist.tsx` | Customer lookup now uses `get_customer_directory()`. |
| `src/context/TasksContext.tsx` | Customer lookup now uses `get_customer_directory()`. |
| `src/hooks/useGlobalLiveAlerts.ts` | Customer lookup now uses `get_customer_directory()`. |

### Item 3 — Recurring invoice extra line items

| File | Change |
|------|--------|
| `src/components/crm/InvoiceLineItemsEditor.tsx` | **New file.** Reusable editor for extra invoice line items plus `extraLineTotal()` helper. |
| `src/components/crm/RecurringInvoiceSchedules.tsx` | Integrated `InvoiceLineItemsEditor`; schedules now store `extra_line_items`, and total/subtotal/VAT calculations include the extras. |
| `src/components/crm/ProposalInvoicesTab.tsx` | Manual invoice creation/editing also integrates `InvoiceLineItemsEditor`; extra lines are persisted into `line_items` and recalculated into subtotal/VAT/total. |

### Item 4 — Invoice PDF download fix

| File | Change |
|------|--------|
| `src/lib/invoicePdf.ts` | `uploadInvoicePdf` now returns a long-lived signed URL from `createSignedUrl(path, ttl, { download: \`${invoiceNumber}.pdf\` })` instead of `getPublicUrl`. The stored `pdf_url` remains a full URL; the `invoice-pdfs` bucket stays private. |

### Item 5 — Unified invoice reporting

| File | Change |
|------|--------|
| `src/hooks/useInvoiceReport.ts` | **New file.** Loads the combined invoice report via `get_invoice_report()` and computes CRM/Billing/All totals. |
| `src/components/reports/InvoiceTotalsStrip.tsx` | **New file.** CRM + Billing totals strip rendered on dashboards. |
| `src/components/reports/CombinedInvoicesReport.tsx` | **New file.** Full reporting UI with filters and CSV export. |
| `src/components/billing/BillingDashboard.tsx` | Mounted `InvoiceTotalsStrip`. |
| `src/components/crm/CRMDashboard.tsx` | Mounted `InvoiceTotalsStrip`. |
| `src/components/crm/ProposalInvoicesTab.tsx` | Mounted `InvoiceTotalsStrip`. |
| `src/pages/CallBilling.tsx` | Added an `all-invoices` tab rendering `CombinedInvoicesReport`. |

---

## 3. Edge Function changes

| Function | Change |
|----------|--------|
| `supabase/functions/process-invoice-reminders/index.ts` | Before emailing a reminder, derives the storage object path from the stored `pdf_url` (split on `/invoice-pdfs/`, strip the query string, URL-decode) and re-signs it. This makes reminder links fresh and keeps both old public-style and new signed URLs working. Redeployed after the change. |

No other Edge Functions were modified. `supabase/config.toml` was not changed.

---

## 4. Verification results

- **Typecheck:** `npx tsgo` passed with zero errors.
- **Browser checks:**
  - `/call-billing` — All Invoices tab renders `CombinedInvoicesReport` with no console errors.
  - `/crm` — Dashboard renders `InvoiceTotalsStrip` with no console errors.
- **RPC volatility:**
  - `get_customer_directory` — `STABLE` ✓
  - `get_invoice_report` — `STABLE` ✓
  - `generate_due_recurring_invoices` — `VOLATILE` ✓
- **Redirect-conflict trace:**
  - A dead-token user is redirected to `/auth` by `forceReauth()`.
  - A suspended user still reaches `/account-suspended` and is not intercepted by `forceReauth()` because `forceReauth()` checks `hasSuspensionDisplayState()`.
  - No redirect loop was observed.
- **Storage:** `invoice-pdfs` remains private; no `getPublicUrl` calls remain on that bucket in the repo.

---

## 5. Design decisions worth carrying forward

- `proposal_invoices.pdf_url` continues to store a **full URL** (now a signed URL rather than a public URL). The `invoice-pdfs` bucket stays private. The cleaner long-term model — storing the object path and signing purely on demand — was deliberately deferred to a later sprint because it is a data-model change.
- Development's `customers_select_scoped` RLS policy remains authoritative. Live migration `20260724143615` was **not** applied because Development's policy is newer and correct.
- Reporting numbers are computed from a single RPC (`get_invoice_report`) so CRM and Billing dashboards can never diverge.

---

## 6. Intentionally deferred

The following items were explicitly excluded from Sprint 1:

- Redesigning `pdf_url` to store an object path instead of a full URL.
- Customer Accounts feature completion.
- Contracts / Workflow Automation / CRM redesign.
- `CustomerDetailsForm` / `CustomersContext` refactor.
- React Query migration.
- Package-proposal redesign.
- Performance work and general cleanup.
- Live migration `20260724143615` (customers SELECT policy).
- Any `supabase/config.toml` change.

---

## 7. Preserved Development-only work

The following Development-only work was not modified or weakened by Sprint 1:

- Phase 0.5 Development safety hardening (env guards, email guards, public-endpoint guards, dev-only feature flags).
- `DevEnvironmentBanner` and the non-development block screen.
- `StartupWatchdog` and `AppErrorBoundary`.
- `boot-storage-guard.ts` and `withTimeout.ts` utilities.
- Edge Function neutralisation for non-development environments.
- Phase 1B Stage 2 permission work (admin privilege ceiling, permission-grant audit, `can_manage_user_suspension`).
- The user suspension system (`/account-suspended`, `useSuspensionStatus`, `UserSuspensionDialog`).
- All Development migrations from `20260723064303` through `20260728122123`.

---

## 8. Development Baseline

This document establishes the new **Development baseline** following Sprint 1 synchronisation.

Future development must follow this workflow:

1. **All new features are developed in Development first.**
2. **Production hotfixes are applied to Live only when necessary.**
3. **Any Live-only hotfixes must be logged and synchronised back to Development in the next scheduled Synchronisation Sprint.**
4. **This document serves as the reference point for all future synchronisation work.**

---

*End of Sprint 1 Completion Report.*
