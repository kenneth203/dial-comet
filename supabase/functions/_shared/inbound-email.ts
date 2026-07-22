// Shared inbound-email processor used by the inbound-email webhook and the
// retry-inbound-emails cron function. Kept in _shared so each Edge Function
// bundles it independently (cross-function relative imports are not supported).

import { createClient } from 'npm:@supabase/supabase-js@2'

export interface InboundAttachment {
  filename: string
  contentType?: string | null
  size?: number | null
  base64: string
}
export interface InboundPayload {
  from: { address: string; name?: string | null }
  to?: Array<{ address: string; name?: string | null }>
  subject?: string | null
  text?: string | null
  html?: string | null
  messageId?: string | null
  date?: string | null
  attachments?: InboundAttachment[]
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10MB
export const BUCKET = 'task-attachments'

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function sanitizeFilename(name: string): string {
  return (name || 'attachment')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .slice(0, 180)
}

// Core processor — reused by webhook and retry function.
export async function processInboundEmail(
  supabase: ReturnType<typeof createClient>,
  payload: InboundPayload,
  logId: string,
) {
  const senderEmail = payload.from.address.trim().toLowerCase()
  const senderName = (payload.from.name || '').trim() || senderEmail
  const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1] : ''
  const subject = (payload.subject || '').trim() || '(no subject)'
  const attachments = (payload.attachments || []).filter(
    (a) => a && a.filename && a.base64,
  )
  const firstAttachmentName = attachments[0]?.filename || 'no attachment'
  const title = `Digital Dictation - ${firstAttachmentName} - ${senderName}`

  // 0) Sender routing rules — first enabled match wins
  let matchedRuleId: string | null = null
  let ruleCustomerId: string | null = null
  let ruleAssigneeId: string | null = null
  let ruleStatus: string | null = null
  let rulePriority: string | null = null
  try {
    const { data: rules } = await supabase
      .from('email_intake_rules')
      .select('id, match_type, match_value, customer_id, assignee_id, task_status, task_priority')
      .eq('enabled', true)
      .order('sort_order', { ascending: true })
    const subjectLc = subject.toLowerCase()
    const bodyPreviewLc = (payload.text?.trim() || (payload.html ? stripHtml(payload.html) : '')).toLowerCase()
    for (const r of (rules || []) as Array<any>) {
      const val = String(r.match_value || '').trim().toLowerCase()
      if (!val) continue
      const senderNameLc = senderName.toLowerCase()
      const hit =
        (r.match_type === 'email' && senderEmail === val) ||
        (r.match_type === 'name_contains' && senderNameLc.includes(val)) ||
        (r.match_type === 'domain' && senderDomain === val) ||
        (r.match_type === 'subject_contains' && subjectLc.includes(val)) ||
        (r.match_type === 'body_contains' && bodyPreviewLc.includes(val))
      if (hit) {
        matchedRuleId = r.id
        ruleCustomerId = r.customer_id || null
        ruleAssigneeId = r.assignee_id || null
        ruleStatus = r.task_status || null
        rulePriority = r.task_priority || null
        break
      }
    }
  } catch (e) {
    console.warn('Rule lookup failed', e)
  }


  // 1) Customer match (rule overrides auto-match)
  let customerId: string | null = ruleCustomerId
  if (!customerId) {
    try {
      const { data: byTop } = await supabase
        .from('customers').select('id').ilike('email', senderEmail).limit(1).maybeSingle()
      if (byTop?.id) customerId = byTop.id as string
      if (!customerId) {
        const { data: byContact } = await supabase.rpc('find_customer_by_contact_email', { p_email: senderEmail })
        if (byContact) customerId = byContact as string
      }
    } catch (e) { console.warn('Customer match failed', e) }

    if (!customerId) {
      try {
        const { data: rows } = await supabase
          .from('customers').select('id, contacts').not('contacts', 'is', null).limit(500)
        for (const r of (rows || []) as Array<{ id: string; contacts: any }>) {
          const list = Array.isArray(r.contacts) ? r.contacts : []
          if (list.some((c: any) => (c?.email || '').toLowerCase() === senderEmail)) {
            customerId = r.id
            break
          }
        }
      } catch (e) { console.warn('Contacts scan failed', e) }
    }
  }

  // 2) Assignee (rule overrides round-robin)
  let assigneeId: string | null = ruleAssigneeId
  if (!assigneeId) {
    try {
      const { data: next } = await supabase.rpc('pick_next_email_assignee')
      if (next) assigneeId = next as string
    } catch (e) { console.warn('RR failed', e) }
  }


  // 3) created_by fallback
  let createdBy: string | null = assigneeId
  if (!createdBy) {
    const { data: fallbackUser } = await supabase
      .from('system_users').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
    createdBy = (fallbackUser?.id as string) || null
  }
  if (!createdBy) throw new Error('No system users configured')

  // 4) Description
  const bodyText = payload.text?.trim() || (payload.html ? stripHtml(payload.html) : '')
  const meta = [
    `From: ${senderName} <${senderEmail}>`,
    `Subject: ${subject}`,
    payload.date ? `Date: ${payload.date}` : null,
    payload.messageId ? `Message-ID: ${payload.messageId}` : null,
  ].filter(Boolean).join('\n')
  const description = `${meta}\n\n---\n\n${bodyText || '(no body)'}`.slice(0, 20000)

  // 5) Task
  const { data: task, error: taskErr } = await supabase
    .from('project_tasks')
    .insert({
      title: title.slice(0, 255),
      description,
      status: ruleStatus || 'To Do',
      priority: rulePriority || 'Medium',
      assignee_id: assigneeId,
      created_by: createdBy,
      customer_id: customerId,
      source: 'email',
      service_category: 'VA',
    })
    .select('id').single()
  if (taskErr || !task) throw new Error(taskErr?.message || 'Task insert failed')
  const taskId = task.id as string

  // 6) Attachments
  const uploaded: string[] = []
  const skipped: Array<{ filename: string; reason: string }> = []
  for (const att of attachments) {
    try {
      const bytes = base64ToBytes(att.base64)
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        skipped.push({ filename: att.filename, reason: 'exceeds 10MB' }); continue
      }
      const safeName = sanitizeFilename(att.filename)
      const path = `${taskId}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: att.contentType || 'application/octet-stream', upsert: false,
      })
      if (upErr) { skipped.push({ filename: att.filename, reason: upErr.message }); continue }
      await supabase.from('task_attachments').insert({
        task_id: taskId, file_name: att.filename, file_path: path,
        file_size: bytes.byteLength, content_type: att.contentType || null, uploaded_by: createdBy,
      })
      uploaded.push(att.filename)
    } catch (e: any) {
      skipped.push({ filename: att.filename, reason: e?.message || 'processing error' })
    }
  }

  // 7) Notify assignee
  if (assigneeId) {
    try {
      await supabase.from('task_notifications').insert({
        user_id: assigneeId, task_id: taskId, type: 'task_assigned',
        message: `New email task assigned: ${title}`, is_read: false,
      })
    } catch (e) { console.warn('Notification insert failed', e) }
  }

  // 8) Mark log processed
  await supabase.from('inbound_email_log').update({
    status: 'processed',
    task_id: taskId,
    assigned_to: assigneeId,
    customer_id: customerId,
    matched_rule_id: matchedRuleId,
    error_message: null,
    last_attempt_at: new Date().toISOString(),
  }).eq('id', logId)

  return { task_id: taskId, customer_id: customerId, assignee_id: assigneeId, matched_rule_id: matchedRuleId, uploaded, skipped }
}
