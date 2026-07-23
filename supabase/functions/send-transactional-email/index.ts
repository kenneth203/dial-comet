import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { assertDevEnvironment } from '../_shared/env-guard.ts'
import { assertEmailAllowed, decorateDevSubject, devFooterHtml } from '../_shared/email-guard.ts'


// Configuration baked in at scaffold time — do NOT change these manually.
// To update, re-run the email domain setup flow.
const SITE_NAME = "The VA Team"
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers — never the root domain.
// The email API looks up this exact domain; a mismatch causes "No email domain record found".
const SENDER_DOMAIN = "notify.portal.thevateam.co.uk"
// FROM_DOMAIN is the domain shown in the From: header (e.g., "example.com").
// When display_from_root is enabled, this can be the root domain for cleaner branding,
// even though actual sending uses the subdomain above.
const FROM_DOMAIN = "notify.portal.thevateam.co.uk"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  // Phase 0.5 environment gate
  const envBlock = assertDevEnvironment();
  if (envBlock) return envBlock;


  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // --- Role-based authorization ---
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const token = authHeader.replace('Bearer ', '')

  // Service role client (also used for server-to-server invocations)
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  // Allow server-to-server calls using the service role key
  // (e.g. submit-proposal invoking this function to send the internal sign-up notification + invoice email)
  const isServiceRoleCall = token === supabaseServiceKey

  if (!isServiceRoleCall) {
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = claimsData.claims.sub
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .single()

    const ALLOWED_ROLES = ['Super-Admin', 'Supervisor']
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient privileges' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let bccEmails: string[] = []
  let replyTo: string | undefined
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
    const rawBcc = body.bccEmails || body.bcc_emails || body.bcc
    if (Array.isArray(rawBcc)) {
      bccEmails = rawBcc.filter((e: unknown): e is string => typeof e === 'string' && e.includes('@'))
    } else if (typeof rawBcc === 'string' && rawBcc.includes('@')) {
      bccEmails = [rawBcc]
    }
    const rawReplyTo = body.replyTo || body.reply_to
    if (typeof rawReplyTo === 'string' && rawReplyTo.includes('@')) {
      replyTo = rawReplyTo.trim()
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Templates that should always BCC Kenneth so he has a record of every outbound copy.
  // We send a separate "[Copy]" email rather than a true SMTP BCC so it shows up cleanly
  // in his inbox AND in the email_send_log for audit purposes.
  // Phase 0.5: hard-coded Kenneth BCC removed. Notification copies must be
  // controlled through DEV_EMAIL_ALLOWLIST / DEV_NOTIFICATIONS_TO and pass
  // the email guard below.


  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Reuse the service role client created during auth check
  const supabase = serviceClient

  // Merge any admin-edited template overrides into templateData so the
  // React Email component can render the latest wording without redeploying.
  try {
    const { data: override } = await supabase
      .from('email_template_content')
      .select('subject, body_text, signature_text')
      .eq('template_name', templateName)
      .maybeSingle()
    if (override) {
      templateData = {
        ...templateData,
        bodyText: templateData.bodyText ?? override.body_text ?? undefined,
        signatureText: templateData.signatureText ?? override.signature_text ?? undefined,
        subjectOverride: templateData.subjectOverride ?? override.subject ?? undefined,
      }
    }
  } catch (overrideErr) {
    console.warn('email_template_content lookup failed; using built-in defaults', overrideErr)
  }

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // This is a safety fallback; log and skip sending.
    console.warn('Unsubscribe token already used but email not suppressed', {
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message:
        'Unsubscribe token used but email missing from suppressed list',
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const rawSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject
  const resolvedSubject = decorateDevSubject(rawSubject)
  const devHtml = html + devFooterHtml()

  // Phase 0.5 email guard — checks to/cc/bcc/reply_to against DEV_EMAIL_ALLOWLIST
  const guardResult = assertEmailAllowed({
    to: effectiveRecipient,
    bcc: bccEmails,
    reply_to: replyTo,
  })
  if (!guardResult.allowed) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'blocked_dev',
    })
    console.warn('[email-guard] blocked send', guardResult)
    return new Response(
      JSON.stringify({ success: false, reason: guardResult.reason, blocked: guardResult.blocked }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 5. Enqueue the pre-rendered email for async processing by the dispatcher.
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })


  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      ...(replyTo ? { reply_to: replyTo } : {}),
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue email', {
      error: enqueueError,
      templateName,
      effectiveRecipient,
    })

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })

    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Transactional email enqueued', { templateName, effectiveRecipient })

  // Send a separate "[Copy]" of the email to each BCC address. We don't use a real SMTP BCC
  // because (a) suppression/unsubscribe must be tracked per-recipient and (b) it gives each
  // copy its own row in email_send_log for audit.
  const bccResults: Array<{ to: string; success: boolean; reason?: string }> = []
  for (const bccRaw of bccEmails) {
    const bccAddress = bccRaw.trim()
    if (!bccAddress || bccAddress.toLowerCase() === effectiveRecipient.toLowerCase()) continue

    try {
      const { data: bccSuppressed } = await supabase
        .from('suppressed_emails')
        .select('id')
        .eq('email', bccAddress.toLowerCase())
        .maybeSingle()
      if (bccSuppressed) {
        bccResults.push({ to: bccAddress, success: false, reason: 'suppressed' })
        continue
      }

      const bccNormalized = bccAddress.toLowerCase()
      let bccUnsubToken: string | null = null
      const { data: existingBccTok } = await supabase
        .from('email_unsubscribe_tokens')
        .select('token, used_at')
        .eq('email', bccNormalized)
        .maybeSingle()
      if (existingBccTok && !existingBccTok.used_at) {
        bccUnsubToken = existingBccTok.token
      } else if (!existingBccTok) {
        const newTok = generateToken()
        await supabase
          .from('email_unsubscribe_tokens')
          .upsert({ token: newTok, email: bccNormalized }, { onConflict: 'email', ignoreDuplicates: true })
        const { data: storedTok } = await supabase
          .from('email_unsubscribe_tokens')
          .select('token')
          .eq('email', bccNormalized)
          .maybeSingle()
        bccUnsubToken = storedTok?.token ?? newTok
      } else {
        bccResults.push({ to: bccAddress, success: false, reason: 'unsubscribed' })
        continue
      }

      const bccMessageId = crypto.randomUUID()
      const bccSubject = `[Copy → ${effectiveRecipient}] ${resolvedSubject}`

      await supabase.from('email_send_log').insert({
        message_id: bccMessageId,
        template_name: templateName,
        recipient_email: bccAddress,
        status: 'pending',
      })

      const { error: bccEnqueueError } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: bccMessageId,
          to: bccAddress,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: bccSubject,
          html,
          text: plainText,
          purpose: 'transactional',
          label: `${templateName}-bcc`,
          idempotency_key: `${idempotencyKey}-bcc-${bccNormalized}`,
          unsubscribe_token: bccUnsubToken,
          ...(replyTo ? { reply_to: replyTo } : {}),
          queued_at: new Date().toISOString(),
        },
      })

      if (bccEnqueueError) {
        await supabase.from('email_send_log').insert({
          message_id: bccMessageId,
          template_name: templateName,
          recipient_email: bccAddress,
          status: 'failed',
          error_message: 'Failed to enqueue BCC copy',
        })
        bccResults.push({ to: bccAddress, success: false, reason: 'enqueue_failed' })
      } else {
        bccResults.push({ to: bccAddress, success: true })
      }
    } catch (e) {
      console.error('BCC copy error', { bccAddress, error: e })
      bccResults.push({ to: bccAddress, success: false, reason: 'exception' })
    }
  }

  return new Response(
    JSON.stringify({ success: true, queued: true, bcc: bccResults }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
