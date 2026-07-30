## Development Synchronisation Sprint 1 (Live → Development)

Port six production hotfixes from Live into Development. No redesign, no refactor, no React Query, no file moves or renames, no unrelated cleanup. Where a Development file is newer, only the required Live change is merged in.

Verified before planning: Development still runs the pre-fix code in every area below, and `supabase/config.toml` stays untouched (your decision — no `verify_jwt` entries added).

---

### Item 1 — Chat stability

Two Live fixes from 24 July, both absent here.

**Database (2 migrations, in order, ported from Live `20260724125525` and `20260724125948`)**
- `mark_chat_room_read(p_room_id uuid) returns integer`
- `get_chat_unread_counts() returns table(room_id uuid, unread_count bigint)`
- Indexes on `chat_messages (room_id, sender_id, id)` and `chat_message_reads (user_id, message_id)`
- `REVOKE EXECUTE … FROM PUBLIC, anon`; `GRANT EXECUTE … TO authenticated` on both

**Code**
- `src/components/chat/MessagesList.tsx` — remove the per-message read-receipt `IntersectionObserver` and its batch-flush machinery (lines 30-34, 57-124, plus the `data-message-id`/`data-sender-id` refs it feeds). Keep the separate bottom-sentinel observer, `useMessageReactions`, and auto-scroll exactly as they are.
- `src/hooks/useChatUnread.ts` — replace the membership → messages → read-receipts three-query calculation with one `get_chat_unread_counts()` call. Keep the realtime channel, the UUID channel-name strategy, the optimistic increment and the notification ping.
- `src/hooks/useChat.ts` — `markAsRead` calls `mark_chat_room_read` with request de-duplication; `sendMessage` returns an explicit boolean; its catch block detects auth-class failures (`PGRST301`, jwt/auth/permission/RLS) and shows "Session expired".
- `src/components/chat/ChatPanel.tsx` — stop firing read receipts on every message change.
- `src/components/chat/MessageComposer.tsx` and `src/pages/Chat.tsx` — clear the input only after the send resolves true, so failed sends keep the user's text.
- `src/context/AuthContext.tsx` — **section merge only.** Add `isRefreshTokenFailure()` (matches `refresh_token_not_found` / `refresh_token_already_used`) and `forceReauth()` (deep-clean every `sb-*-auth-token` key from `localStorage` and `sessionStorage`, sign out, redirect to `/auth`), wired into session bootstrap and the unhandled-rejection path. Development's `withTimeout` bootstrap, `clearProjectAuthStorage`, status reconciliation and offline-on-signout logic all stay.

**Redirect-conflict check (mandatory).** `forceReauth()` targets `/auth`; `src/lib/suspensionSession.ts` independently signs out toward `/account-suspended`. Trace both, confirm a suspended user still reaches `/account-suspended`, a dead-token user reaches `/auth`, and neither re-enters the other. If they can race, gate `forceReauth()` behind a check for an in-flight suspension redirect.

### Item 2 — Customer directory RPC

- Port Live `20260730065423` then `20260730070557`: the second drops the interim `customer_directory` view and creates `get_customer_directory()` — `SECURITY DEFINER`, `search_path = public`, requires `auth.uid()`, returns `id, name, status, account_id` only, EXECUTE revoked from `anon`/`PUBLIC` and granted to `authenticated`/`service_role`.
- Switch six call sites to `supabase.rpc("get_customer_directory")`: `ChecklistTemplateBuilder.tsx`, `EmailIntakeRules.tsx`, `EmailRoutingAuditLog.tsx`, `DailyChecklist.tsx`, `TasksContext.tsx`, `useGlobalLiveAlerts.ts`. Client-side sort where the old query relied on `.order()`; `.find()` where it relied on `.maybeSingle()`.
- Development's RLS is untouched. Live's `20260724143615` (customers SELECT) is **not applied** — Development's `customers_select_scoped` stays authoritative.

### Item 3 — Recurring invoice extra line items

- Port Live `20260730064333`: `extra_line_items jsonb` on `recurring_invoice_schedules`, plus the updated `generate_due_recurring_invoices` that includes them in totals. Additive column with a default — no breaking change.
- Add `src/components/crm/InvoiceLineItemsEditor.tsx` (new file, exports the editor plus `extraLineTotal`).
- Merge its use into `RecurringInvoiceSchedules.tsx` and `ProposalInvoicesTab.tsx`. Invoice generation logic is otherwise unchanged.

### Item 4 — Invoice PDF download fix

**Pre-implementation verification (done).** Development stores the **full URL**, not the object path: `src/lib/invoicePdf.ts:216` returns `getPublicUrl(path).publicUrl`, and `ProposalInvoicesTab.tsx:275` persists that string into `proposal_invoices.pdf_url`. `invoice-pdfs` is private, so those URLs 404. `proposal_invoices` currently holds 0 rows, so there is no legacy data to migrate.

Conclusion: keep the existing URL-in-column data model and adopt the Live behaviour. **No schema change, no column rename, no data migration, no path/URL redesign in this sprint.**

- `src/lib/invoicePdf.ts` — after upload, return a long-lived signed URL from `createSignedUrl(path, ttl, { download: \`${invoiceNumber}.pdf\` })` instead of `getPublicUrl`. Same return type (`Promise<string>`), same call sites, same column. Bucket stays private; no storage policy change.
- `supabase/functions/process-invoice-reminders/index.ts` — before emailing, derive the object path from the stored `pdf_url` (split on `/invoice-pdfs/`, strip the query string, URL-decode) and re-sign it. This makes reminder links fresh and keeps any URL shape — old public-style or new signed — working, so nothing breaks if rows appear before deploy. Deploy the function afterwards.
- Check the resend path in `ProposalInvoicesTab.tsx`; re-sign there too if it reuses a stored URL rather than regenerating the PDF.
- Finish with a repo-wide check that no invoice flow calls `getPublicUrl` on `invoice-pdfs`. Other buckets (`form-images`, `noticeboard-images`) are out of scope.

Noted for a later sprint, not now: storing the object path and signing purely on demand is the cleaner model, but that is a data-model change and is deliberately excluded from Sprint 1.

### Item 5 — Unified invoice reporting

- Port Live `20260730065946` (the `invoices_unified` view and `get_invoice_report`), with the hardening from `20260730070557` (view set to `security_invoker = on`, direct SELECT revoked from `anon`/`authenticated`, access only through the `has_billing_access()`-gated RPC).
- Add `src/hooks/useInvoiceReport.ts`, `src/components/reports/InvoiceTotalsStrip.tsx`, `src/components/reports/CombinedInvoicesReport.tsx`.
- Mount them exactly as Live does: totals strip in `BillingDashboard.tsx`, `CRMDashboard.tsx` and `ProposalInvoicesTab.tsx`; an `all-invoices` tab rendering `CombinedInvoicesReport` in `CallBilling.tsx`. Existing Development reporting (`UnifiedBillingReports`, `MonthlyCallBillingReport`, `Reports.tsx`) is left alone.

### Item 6 — Security hotfixes

- Port Live `20260724101031` only: `inbound_email_log` SELECT via `is_admin_or_higher()` with explicit deny on INSERT/UPDATE/DELETE for authenticated (writes stay service-role), and four admin-only `storage.objects` policies scoped to `database_export_22_07_26`.
- Check Development's `20260724075510` first and skip anything it already covers.
- No other RLS tightening. Customer, account and form security untouched.

---

### Migration safety rule for the whole sprint

Every migration in Sprint 1 is additive: new functions, new indexes, new policies, one new nullable JSONB column with a default, one new view. No column drops, no renames, no type changes, no destructive data statements.

### Order of work

```text
1  Migrations: chat (x2) → security → recurring items → reporting/directory (2 of 30 Jul, in order)
2  Let types.ts regenerate — never hand-edited, never copied from Live
3  New files: InvoiceLineItemsEditor, useInvoiceReport, InvoiceTotalsStrip, CombinedInvoicesReport
4  Chat code (AuthContext last, after the redirect-conflict trace)
5  Directory RPC call sites (6)
6  Invoice PDF signing + deploy process-invoice-reminders
7  Reporting mount points (4)
8  Typecheck, then behavioural verification
```

### Verification

Chat: message sends persist; no per-message write burst in the network panel; unread counts correct; failed send keeps the text; dead-token redirect to `/auth`; suspended user still reaches `/account-suspended`; no loop.
Customers: names render on checklist, email-intake, routing audit, daily checklist, tasks and live alerts; no direct `customers` reads remain on those paths.
Invoices: recurring generation correct; extra line items total correctly; a generated invoice PDF downloads from the private bucket; a reminder run produces a working signed link.
Reporting: report loads; CRM and billing totals agree with existing data.
Security: `inbound_email_log` and export-bucket permissions behave as intended.

### Preserved, explicitly

Phase 0.5 hardening, environment/email/public-endpoint guards, Development banner, watchdog, error boundary, storage guard, timeout utilities, Edge Function neutralisation, Phase 1B Stage 2 permission work, admin privilege ceiling, the suspension system, and every Development migration from `20260723064303` to `20260728122123`.

### Not implemented

Customer Accounts, Contracts, Workflow Automation, CRM redesign, `CustomerDetailsForm` / `CustomersContext` refactoring, React Query, package-proposal redesign, performance work, general cleanup, Live migration `20260724143615`, any `config.toml` change, and any change to how invoice PDF locations are stored.
