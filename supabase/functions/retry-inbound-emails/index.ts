// Retries failed inbound email log rows. Invoked by pg_cron every 5 minutes,
// and callable manually (per-row) from the Dictation Intake UI.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { processInboundEmail } from '../_shared/inbound-email.ts'

const MAX_ATTEMPTS = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  // Auth: allow either (a) cron-secret header, or (b) authenticated admin.
  // Applies to BOTH bulk and single-row (log_id) paths to prevent unauthenticated
  // callers from triggering service-role retries.
  const cronSecret = Deno.env.get('RETRY_INBOUND_CRON_SECRET') || Deno.env.get('POLL_GMAIL_CRON_SECRET')
  const providedCron = req.headers.get('x-cron-secret')
  const isCron = !!cronSecret && providedCron === cronSecret

  let singleId: string | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body?.log_id && typeof body.log_id === 'string') singleId = body.log_id
    } catch { /* ignore */ }
  }

  if (!isCron) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token)
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: su } = await supabase
      .from('system_users').select('role').eq('id', claims.claims.sub).maybeSingle()
    if (!su || !['Super-Admin', 'Admin'].includes(su.role as string)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }


  // Find candidates
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  let query = supabase.from('inbound_email_log')
    .select('id, raw_payload, attempt_count, message_id')
    .eq('status', 'failed')
    .lt('attempt_count', MAX_ATTEMPTS)
    .lt('last_attempt_at', fiveMinAgo)
    .order('received_at', { ascending: true })
    .limit(20)

  if (singleId) {
    query = supabase.from('inbound_email_log')
      .select('id, raw_payload, attempt_count, message_id')
      .eq('id', singleId).limit(1) as any
  }

  const { data: rows, error } = await query
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const row of rows || []) {
    const logId = row.id as string
    const payload = row.raw_payload as any
    if (!payload?.from?.address) {
      await supabase.from('inbound_email_log').update({
        status: 'failed',
        error_message: 'Missing payload for retry',
        attempt_count: (row.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
      }).eq('id', logId)
      results.push({ id: logId, ok: false, error: 'Missing payload' })
      continue
    }
    await supabase.from('inbound_email_log').update({
      status: 'retrying',
      attempt_count: (row.attempt_count || 0) + 1,
      last_attempt_at: new Date().toISOString(),
    }).eq('id', logId)

    try {
      await processInboundEmail(supabase, payload, logId)
      results.push({ id: logId, ok: true })
    } catch (e: any) {
      await supabase.from('inbound_email_log').update({
        status: 'failed',
        error_message: (e?.message || String(e)).slice(0, 1000),
        last_attempt_at: new Date().toISOString(),
      }).eq('id', logId)
      results.push({ id: logId, ok: false, error: e?.message })
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
