// Polls the connected Gmail mailbox for unread messages addressed to the
// dictations alias and pipes each one through the existing inbound-email
// processor. Scheduled via pg_cron every 5 minutes; also callable manually
// (POST from admin UI) to trigger an on-demand poll.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
// Note: inbound-email is invoked over HTTP (cross-function imports don't bundle).

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1'
const DEFAULT_QUERY = 'to:dictations@thevateam.london is:unread newer_than:7d'
const MAX_PER_RUN = 15

interface GmailHeader { name: string; value: string }
interface GmailPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}
interface GmailMessage {
  id: string
  threadId?: string
  labelIds?: string[]
  payload?: GmailPart
  internalDate?: string
}

function b64urlToStd(s: string): string {
  return s.replace(/-/g, '+').replace(/_/g, '/')
}
function decodeBody(dataB64Url: string): string {
  try {
    const bin = atob(b64urlToStd(dataB64Url))
    // Treat as UTF-8
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch { return '' }
}

function headerVal(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null
  const lower = name.toLowerCase()
  return headers.find((h) => h.name.toLowerCase() === lower)?.value ?? null
}

// Parse "Kenneth <ken@x.com>" or "ken@x.com" into { name, address }
function parseAddress(raw: string | null): { address: string; name: string | null } {
  if (!raw) return { address: '', name: null }
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || null, address: m[2].trim() }
  return { address: raw.trim(), name: null }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function firstHeaderLine(source: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\n)\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^\\r\\n]+)`, 'i')
  return source.match(re)?.[1]?.trim() || null
}

function applyForwardedHeaders(payload: {
  from: { address: string; name: string | null }
  to: Array<{ address: string; name: string | null }>
  subject: string | null
  text: string
  html: string
  messageId: string
  date: string | null
  attachments: Array<{ filename: string; contentType?: string; size?: number; base64: string }>
}) {
  const source = payload.text || (payload.html ? stripHtml(payload.html) : '')
  if (!source) return payload

  const forwardedFrom = firstHeaderLine(source, 'From')
  const forwardedSubject = firstHeaderLine(source, 'Subject')
  const forwardedTo = firstHeaderLine(source, 'To')
  const forwardedDate = firstHeaderLine(source, 'Date')

  if (forwardedFrom) {
    const parsed = parseAddress(forwardedFrom)
    if (parsed.address.includes('@')) payload.from = parsed
  }
  if (forwardedSubject) payload.subject = forwardedSubject
  if (forwardedTo) payload.to = forwardedTo.split(',').map((s) => parseAddress(s)).filter((x) => x.address)
  if (forwardedDate) payload.date = forwardedDate

  return payload
}

function walkParts(part: GmailPart | undefined, out: GmailPart[] = []): GmailPart[] {
  if (!part) return out
  out.push(part)
  if (part.parts) for (const p of part.parts) walkParts(p, out)
  return out
}

async function gwFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  const connKey = Deno.env.get('GOOGLE_MAIL_API_KEY')
  if (!lovableKey || !connKey) throw new Error('Gmail connector env vars missing')
  return fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Authorization': `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': connKey,
      'Content-Type': 'application/json',
    },
  })
}

async function listMessages(query: string, maxResults: number): Promise<Array<{ id: string }>> {
  const url = `/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`
  const r = await gwFetch(url)
  if (!r.ok) throw new Error(`Gmail list failed [${r.status}]: ${await r.text()}`)
  const j = await r.json()
  return (j.messages || []) as Array<{ id: string }>
}

async function getMessage(id: string): Promise<GmailMessage> {
  const r = await gwFetch(`/users/me/messages/${id}?format=full`)
  if (!r.ok) throw new Error(`Gmail get failed [${r.status}]: ${await r.text()}`)
  return await r.json()
}

async function getAttachmentData(msgId: string, attachmentId: string): Promise<string> {
  const r = await gwFetch(`/users/me/messages/${msgId}/attachments/${attachmentId}`)
  if (!r.ok) throw new Error(`Gmail att failed [${r.status}]: ${await r.text()}`)
  const j = await r.json()
  return (j.data as string) || ''
}

async function markRead(id: string): Promise<void> {
  const r = await gwFetch(`/users/me/messages/${id}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
  if (!r.ok) throw new Error(`Gmail modify failed [${r.status}]: ${await r.text()}`)
}

async function buildPayload(msg: GmailMessage) {
  const headers = msg.payload?.headers
  const fromRaw = headerVal(headers, 'From')
  const toRaw = headerVal(headers, 'To')
  const subject = headerVal(headers, 'Subject')
  const messageId = headerVal(headers, 'Message-ID') || headerVal(headers, 'Message-Id') || `gmail-${msg.id}`
  const date = headerVal(headers, 'Date')

  const from = parseAddress(fromRaw)
  const to = toRaw ? toRaw.split(',').map((s) => parseAddress(s)) : []

  let text = ''
  let html = ''
  const attachments: Array<{ filename: string; contentType?: string; size?: number; base64: string }> = []

  for (const p of walkParts(msg.payload)) {
    const mime = (p.mimeType || '').toLowerCase()
    if (p.filename && p.body?.attachmentId) {
      try {
        const data = await getAttachmentData(msg.id, p.body.attachmentId)
        const std = b64urlToStd(data)
        attachments.push({
          filename: p.filename,
          contentType: p.mimeType || undefined,
          size: p.body.size || undefined,
          base64: std,
        })
      } catch (e) {
        console.warn('attachment fetch failed', p.filename, e)
      }
    } else if (!p.filename && p.body?.data) {
      const decoded = decodeBody(p.body.data)
      if (mime === 'text/plain' && !text) text = decoded
      else if (mime === 'text/html' && !html) html = decoded
    }
  }

  return applyForwardedHeaders({
    from: { address: from.address, name: from.name },
    to,
    subject,
    text,
    html,
    messageId,
    date,
    attachments,
  })
}

async function requireAdmin(req: Request, supabaseUrl: string): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } })
  const token = authHeader.replace('Bearer ', '')
  const { data: claims, error } = await userClient.auth.getClaims(token)
  if (error || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: su } = await service
    .from('system_users').select('role').eq('user_id', claims.claims.sub).maybeSingle()
  if (!su || !['Super-Admin', 'Admin'].includes((su.role as string) || '')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const inboundSecret = Deno.env.get('INBOUND_EMAIL_SECRET')
  const cronSecret = Deno.env.get('POLL_GMAIL_CRON_SECRET')
  if (!supabaseUrl || !serviceKey || !inboundSecret) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Auth: allow either (a) cron-secret header, or (b) authenticated admin.
  const providedCron = req.headers.get('x-cron-secret')
  const isCron = !!cronSecret && providedCron === cronSecret
  if (!isCron) {
    const authHeader = req.headers.get('Authorization')
    // If no bearer token at all, reject — cron must supply the secret.
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const denied = await requireAdmin(req, supabaseUrl)
    if (denied) return denied
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // Load config (query, enabled)
  const { data: cfg } = await supabase
    .from('email_intake_settings' as any)
    .select('gmail_query, gmail_poll_enabled')
    .maybeSingle() as any

  if (cfg && cfg.gmail_poll_enabled === false) {
    return new Response(JSON.stringify({ skipped: true, reason: 'poll disabled' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const query = (cfg?.gmail_query as string) || DEFAULT_QUERY

  let listed: Array<{ id: string }> = []
  try {
    listed = await listMessages(query, MAX_PER_RUN)
  } catch (e: any) {
    console.error('Gmail list failed', e)
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: Array<{ gmail_id: string; ok: boolean; task_id?: string; log_id?: string; error?: string; skipped?: string }> = []

  for (const item of listed) {
    try {
      const msg = await getMessage(item.id)
      const payload = await buildPayload(msg)
      if (!payload.from.address) {
        results.push({ gmail_id: item.id, ok: false, error: 'no from address' })
        await markRead(item.id).catch(() => {})
        continue
      }

      // Dedupe / log row
      const { data: existing } = await supabase
        .from('inbound_email_log').select('id, status, task_id').eq('message_id', payload.messageId).maybeSingle()

      let logId: string
      if (existing?.id) {
        if (existing.status === 'processed' || existing.task_id) {
          await supabase.from('inbound_email_log').update({
            status: 'processed',
            error_message: null,
            last_attempt_at: new Date().toISOString(),
          }).eq('id', existing.id)
          await markRead(item.id).catch(() => {})
          results.push({ gmail_id: item.id, ok: true, log_id: existing.id, task_id: existing.task_id || undefined, skipped: 'already processed' })
          continue
        }
        logId = existing.id as string
        await supabase.from('inbound_email_log').update({
          from_email: payload.from.address.toLowerCase(),
          from_name: payload.from.name,
          subject: payload.subject,
          attachment_count: payload.attachments.length,
          attachment_names: payload.attachments.map((a) => a.filename).slice(0, 20),
          status: 'received',
          raw_payload: payload as any,
          last_attempt_at: new Date().toISOString(),
        }).eq('id', logId)
      } else {
        const { data: inserted, error: insErr } = await supabase.from('inbound_email_log').insert({
          from_email: payload.from.address.toLowerCase(),
          from_name: payload.from.name,
          subject: payload.subject,
          message_id: payload.messageId,
          attachment_count: payload.attachments.length,
          attachment_names: payload.attachments.map((a) => a.filename).slice(0, 20),
          status: 'received',
          raw_payload: payload as any,
          attempt_count: 1,
          last_attempt_at: new Date().toISOString(),
        }).select('id').single()
        if (insErr || !inserted) {
          results.push({ gmail_id: item.id, ok: false, error: `log insert: ${insErr?.message}` })
          continue
        }
        logId = inserted.id as string
      }

      try {
        const invokeRes = await fetch(`${supabaseUrl}/functions/v1/inbound-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'x-inbound-secret': inboundSecret,
            'x-inbound-log-id': logId,
          },
          body: JSON.stringify(payload),
        })
        const bodyText = await invokeRes.text()
        if (!invokeRes.ok) {
          throw new Error(`inbound-email ${invokeRes.status}: ${bodyText.slice(0, 500)}`)
        }
        let out: any = {}
        try { out = JSON.parse(bodyText) } catch { /* ignore */ }
        if (out?.queued_for_retry || out?.error) {
          throw new Error(`inbound-email processing failed: ${out?.error || bodyText.slice(0, 500)}`)
        }
        await markRead(item.id).catch((e) => console.warn('markRead failed', e))
        results.push({
          gmail_id: item.id,
          ok: true,
          log_id: logId,
          task_id: out?.task_id,
        })
      } catch (e: any) {
        await supabase.from('inbound_email_log').update({
          status: 'failed',
          error_message: (e?.message || String(e)).slice(0, 1000),
          last_attempt_at: new Date().toISOString(),
        }).eq('id', logId)
        // Leave message UNREAD so a future run / retry can try again.
        results.push({ gmail_id: item.id, ok: false, log_id: logId, error: e?.message })
      }
    } catch (e: any) {
      console.error('poll iteration failed', item.id, e)
      results.push({ gmail_id: item.id, ok: false, error: e?.message || String(e) })
    }
  }

  return new Response(JSON.stringify({
    scanned: listed.length,
    processed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
