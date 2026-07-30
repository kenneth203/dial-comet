## Sprint 1 Completion Report (documentation only)

Create one new markdown file — `docs/SPRINT-1-COMPLETION.md` — as the baseline reference for future development. No code, schema, Edge Function or config changes.

### Document structure

1. **Overview** — purpose of Sprint 1 (port six Live hotfixes into Development), scope boundaries, date, environment (Development/remix only, nothing published to Live).

2. **Database migrations applied** — listed in the order they ran, each with what it added:
   - Chat migrations: `mark_chat_room_read(uuid)`, `get_chat_unread_counts()`, indexes on `chat_messages (room_id, sender_id, id)` and `chat_message_reads (user_id, message_id)`, EXECUTE revoked from `PUBLIC`/`anon` and granted to `authenticated`.
   - Recurring invoices + security: `extra_line_items jsonb` on `recurring_invoice_schedules`, updated `generate_due_recurring_invoices`, `inbound_email_log` read lockdown via `is_admin_or_higher()` with writes reserved for service role, admin-only `storage.objects` policies scoped to `database_export_22_07_26`.
   - Reporting + directory: `invoices_unified` view (`security_invoker = on`, direct SELECT revoked), `get_invoice_report`, `get_customer_directory` replacing the interim `customer_directory` view.
   - A note that Sprint 1 introduced no destructive schema changes. Migrations were additive except for the removal of the temporary `customer_directory` view, which was immediately replaced by the production `get_customer_directory()` RPC as part of the synchronisation. No production data was removed or altered.

3. **Files changed** — grouped by sprint item, each with a one-line description of the change:
   - Item 1 Chat: `useChatUnread.ts`, `useChat.ts`, `MessagesList.tsx`, `ChatPanel.tsx`, `MessageComposer.tsx`, `Chat.tsx`, `AuthContext.tsx`.
   - Item 2 Directory RPC: the six call sites.
   - Item 3 Recurring extras: new `InvoiceLineItemsEditor.tsx`, plus `RecurringInvoiceSchedules.tsx` and `ProposalInvoicesTab.tsx`.
   - Item 4 PDF signing: `invoicePdf.ts`.
   - Item 5 Reporting: new `useInvoiceReport.ts`, `InvoiceTotalsStrip.tsx`, `CombinedInvoicesReport.tsx`, plus the four mount points (`BillingDashboard.tsx`, `CRMDashboard.tsx`, `ProposalInvoicesTab.tsx`, `CallBilling.tsx`).

4. **Edge Function changes** — `process-invoice-reminders`: derives the object path from the stored `pdf_url` and re-signs before emailing; redeployed. No other functions touched; `supabase/config.toml` untouched.

5. **Verification results** — typecheck clean; browser checks on `/call-billing` and `/crm` with no console errors; RPC volatility confirmed (`get_customer_directory` and `get_invoice_report` stable, `generate_due_recurring_invoices` volatile); redirect-conflict trace confirming dead-token users reach `/auth` and suspended users still reach `/account-suspended`.

6. **Design decisions worth carrying forward** — `pdf_url` keeps storing a full (now signed) URL; `invoice-pdfs` stays private; Development's `customers_select_scoped` RLS remains authoritative over Live's variant.

7. **Intentionally deferred** — storing object paths instead of URLs, Customer Accounts, Contracts, Workflow Automation, CRM redesign, `CustomerDetailsForm`/`CustomersContext` refactor, React Query migration, package-proposal redesign, performance work, general cleanup, Live migration `20260724143615`, any `config.toml` change.

8. **Preserved Development-only work** — Phase 0.5 hardening, env/email/public-endpoint guards, Development banner, startup watchdog, error boundary, storage guard, timeout utilities, Phase 1B Stage 2 permission work, admin privilege ceiling, the suspension system, and all Development migrations from `20260723064303` to `20260728122123`.

9. **Development Baseline** — record that this document establishes the new Development baseline following Sprint 1 synchronisation. Future development should follow this workflow:
   - All new features are developed in Development first.
   - Production hotfixes are applied to Live only when necessary.
   - Any Live-only hotfixes must be logged and synchronised back to Development in the next scheduled Synchronisation Sprint.
   - This document serves as the reference point for future synchronisation work.

### Notes

Exact migration timestamps and file line references are read back from the repo and the database while writing, so the document records what actually shipped rather than what was planned.
