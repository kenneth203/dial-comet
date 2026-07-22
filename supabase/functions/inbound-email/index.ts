// Inbound email → task webhook.
// Called by the Cloudflare Email Worker with a shared secret.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { processInboundEmail, type InboundPayload } from '../_shared/inbound-email.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const expected = Deno.env.get('INBOUND_EMAIL_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!expected || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const provided = req.headers.get('x-inbound-secret')
  if (!provided || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let payload: InboundPayload
  try { payload = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!payload?.from?.address) {
    return new Response(JSON.stringify({ error: 'Missing from.address' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const senderEmail = payload.from.address.trim().toLowerCase()
  const senderName = (payload.from.name || '').trim() || null
  const subject = (payload.subject || '').trim() || null
  const attachments = (payload.attachments || []).filter((a) => a && a.filename && a.base64)
  const attachmentNames = attachments.map((a) => a.filename).slice(0, 20)
  const messageId = payload.messageId || `local-${crypto.randomUUID()}`

  // Upsert log row (dedupe by message_id)
  const { data: existing } = await supabase
    .from('inbound_email_log').select('id, status').eq('message_id', messageId).maybeSingle()

  let logId: string
  if (existing?.id) {
    if (existing.status === 'processed') {
      return new Response(JSON.stringify({ duplicate: true, log_id: existing.id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    logId = existing.id as string
    await supabase.from('inbound_email_log').update({
      from_email: senderEmail,
      from_name: senderName,
      subject,
      attachment_count: attachments.length,
      attachment_names: attachmentNames,
      status: 'received',
      attempt_count: 0,
      last_attempt_at: new Date().toISOString(),
      raw_payload: payload as any,
    }).eq('id', logId)
  } else {
    const { data: inserted, error: insErr } = await supabase.from('inbound_email_log').insert({
      from_email: senderEmail,
      from_name: senderName,
      subject,
      message_id: messageId,
      attachment_count: attachments.length,
      attachment_names: attachmentNames,
      status: 'received',
      raw_payload: payload as any,
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
    }).select('id').single()
    if (insErr || !inserted) {
      return new Response(JSON.stringify({ error: 'Log insert failed', details: insErr?.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    logId = inserted.id as string
  }

  try {
    const result = await processInboundEmail(supabase, payload, logId)
    return new Response(JSON.stringify({ log_id: logId, ...result }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('Processing failed', e)
    await supabase.from('inbound_email_log').update({
      status: 'failed',
      error_message: (e?.message || String(e)).slice(0, 1000),
      last_attempt_at: new Date().toISOString(),
    }).eq('id', logId)
    // Return 200 so external sender doesn't retry — our own cron handles retries.
    return new Response(JSON.stringify({ log_id: logId, queued_for_retry: true, error: e?.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
