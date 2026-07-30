import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

import { assertDevEnvironment, disabledInDevResponse } from '../_shared/env-guard.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Constant-time string compare to avoid timing oracles
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface InvoiceRow {
  id: string
  customer_id: string
  invoice_number: string
  total: number
  status: string
  issued_at: string
  due_at: string
  client_name: string | null
  company_name: string | null
  pdf_url: string | null
  reminders_sent_at: Record<string, string> | null
}

type ReminderKey = 'due' | 'd3' | 'd5' | 'd7'

const REMINDER_MAP: Record<ReminderKey, { type: string; offsetDays: number; subject: string }> = {
  due:  { type: 'due_today',  offsetDays: 0,  subject: 'due today' },
  d3:   { type: 'overdue_3',  offsetDays: 3,  subject: '3 days overdue' },
  d5:   { type: 'overdue_5',  offsetDays: 5,  subject: '5 days overdue' },
  d7:   { type: 'overdue_7',  offsetDays: 7,  subject: '7 days overdue' },
}

Deno.serve(async (req) => {
  const envBlock = assertDevEnvironment();
  if (envBlock) return envBlock;
  return disabledInDevResponse('process-invoice-reminders');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Only the scheduler can trigger this. We verify the bearer token by
  // cryptographic key match against SUPABASE_SERVICE_ROLE_KEY, instead of
  // decoding unverified JWT claims (which an attacker could forge).
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const token = authHeader.slice('Bearer '.length).trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceRoleKey || !safeEqual(token, serviceRoleKey)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }


  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  // pull all unpaid invoices that might trigger any reminder
  const earliestRelevantDue = new Date(startOfToday.getTime() - 7 * 86400000)
  const latestRelevantDue = new Date(startOfToday.getTime() + 1 * 86400000)

  const { data: invoices, error } = await supabase
    .from('proposal_invoices')
    .select('id,customer_id,invoice_number,total,status,issued_at,due_at,client_name,company_name,pdf_url,reminders_sent_at')
    .neq('status', 'paid')
    .neq('status', 'cancelled')
    .gte('due_at', earliestRelevantDue.toISOString())
    .lte('due_at', latestRelevantDue.toISOString())

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const summary: any[] = []

  for (const inv of (invoices ?? []) as InvoiceRow[]) {
    const due = new Date(inv.due_at)
    const dueDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()))
    const diffDays = Math.round((startOfToday.getTime() - dueDay.getTime()) / 86400000)
    const reminders = inv.reminders_sent_at || {}

    let key: ReminderKey | null = null
    if (diffDays === 0 && !reminders.due) key = 'due'
    else if (diffDays >= 3 && diffDays < 5 && !reminders.d3) key = 'd3'
    else if (diffDays >= 5 && diffDays < 7 && !reminders.d5) key = 'd5'
    else if (diffDays >= 7 && !reminders.d7) key = 'd7'

    if (!key) continue

    // fetch customer email
    const { data: customer } = await supabase
      .from('customers').select('email,contact,name').eq('id', inv.customer_id).maybeSingle()
    const recipientEmail = customer?.email
    if (!recipientEmail) {
      summary.push({ invoice: inv.invoice_number, skipped: 'no_email' })
      continue
    }

    const cfg = REMINDER_MAP[key]

    // invoice-pdfs is a private bucket: re-sign the stored path so the link works
    let pdfLink: string | undefined = inv.pdf_url || undefined
    if (inv.pdf_url) {
      const marker = '/invoice-pdfs/'
      const idx = inv.pdf_url.indexOf(marker)
      if (idx !== -1) {
        const objectPath = inv.pdf_url.slice(idx + marker.length).split('?')[0]
        const { data: signed } = await supabase.storage
          .from('invoice-pdfs')
          .createSignedUrl(decodeURIComponent(objectPath), 60 * 60 * 24 * 30)
        if (signed?.signedUrl) pdfLink = signed.signedUrl
      }
    }

    const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'invoice-reminder',
        recipientEmail,
        idempotencyKey: `invoice-reminder-${inv.id}-${key}`,
        templateData: {
          invoiceNumber: inv.invoice_number,
          clientName: inv.client_name || customer?.contact || '',
          companyName: inv.company_name || customer?.name || '',
          total: Number(inv.total),
          issuedAt: inv.issued_at,
          dueAt: inv.due_at,
          pdfUrl: pdfLink,
          reminderType: cfg.type,
          daysOverdue: diffDays,
        },
      },
    })

    if (sendErr) {
      summary.push({ invoice: inv.invoice_number, key, error: sendErr.message })
      continue
    }

    const updated = { ...reminders, [key]: new Date().toISOString() }
    // mark overdue if past due
    const patch: Record<string, unknown> = { reminders_sent_at: updated }
    if (diffDays > 0 && inv.status !== 'overdue') patch.status = 'overdue'
    await supabase.from('proposal_invoices').update(patch).eq('id', inv.id)

    summary.push({ invoice: inv.invoice_number, sent: cfg.subject, recipientEmail })
  }

  return new Response(JSON.stringify({ processed: summary.length, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
