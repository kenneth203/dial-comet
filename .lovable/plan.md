## Fix: Move shared inbound-email logic to `_shared`

### Problem
`supabase/functions/retry-inbound-emails/index.ts` imports `processInboundEmail` from `../inbound-email/index.ts`. Each Edge Function deploys as an isolated bundle containing only its own directory plus `_shared`, so cross-function imports break Remix/deploy.

### Changes

1. **Create `supabase/functions/_shared/inbound-email.ts`**
   - Move `processInboundEmail` and its helpers (`stripHtml`, `base64ToBytes`, `sanitizeFilename`, `InboundPayload`/`InboundAttachment` types, `MAX_ATTACHMENT_BYTES`, `BUCKET`) verbatim from `inbound-email/index.ts`.
   - Keep the `npm:@supabase/supabase-js@2` import for the `createClient` type.
   - Export `processInboundEmail` and the `InboundPayload` type.

2. **Update `supabase/functions/inbound-email/index.ts`**
   - Remove the moved helpers and `processInboundEmail` definition.
   - Import them from `../_shared/inbound-email.ts`.
   - Deno.serve handler and all behavior unchanged.

3. **Update `supabase/functions/retry-inbound-emails/index.ts`**
   - Change `import { processInboundEmail } from '../inbound-email/index.ts'` to `from '../_shared/inbound-email.ts'`.
   - No other changes.

### Behavior preservation
- No logic changes: same rule matching, customer lookup, round-robin assignee, attachment upload, notification insert, and log status transitions.
- Same exports/signatures; both functions call `processInboundEmail(supabase, payload, logId)` identically.

### Verification
- Confirm both functions typecheck and deploy independently (no cross-function relative imports remain).