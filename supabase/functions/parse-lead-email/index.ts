import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'


interface ParsedLead {
  name?: string
  companyName?: string
  email?: string
  telephone?: string
  service?: string
  heardAboutUs?: string
  message?: string
  enquiryYear?: string
}
const SYSTEM_PROMPT = `You extract structured lead data from two kinds of forwarded emails for The VA Team:
 1. Website "Contact Us" enquiry submissions.
 2. Online booking confirmations (e.g. Discovery Call bookings via Google Calendar / Calendly).

Return ONLY valid JSON matching this exact shape, with empty strings for missing fields:
{
  "name": "",
  "companyName": "",
  "email": "",
  "telephone": "",
  "service": "",
  "heardAboutUs": "",
  "message": "",
  "enquiryYear": "",
  "bookingType": "",
  "bookingDate": "",
  "bookingTime": ""
}
- name: the person's full name (preserve casing, no titles like Mr/Mrs). For bookings use the "Booked by" name.
- companyName: business name if present (e.g. "Business Name: Tests"), else empty.
- email: the lead's email (for bookings use the "Booked by" email).
- telephone: phone number as given, else empty.
- service: which service they're interested in (e.g. Virtual Assistant, Call Answering). For bookings use "Type of Service Required".
- heardAboutUs: how they heard about us, else empty.
- message: the free-text enquiry message, or a short summary line for bookings (e.g. "Booked Online Discovery Call (30 min) with Kenneth").
- enquiryYear: 4-digit year if present, else empty.
- bookingType: for booking emails, the meeting title (e.g. "Online Discovery Call (30 min) with Kenneth"). Empty for plain enquiries.
- bookingDate: for booking emails, the date in DD/MM/YYYY format (UK). Empty for plain enquiries.
- bookingTime: for booking emails, the time range as given (e.g. "15:00 – 15:30"). Empty for plain enquiries.
No commentary, no markdown, just JSON.`


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Require authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token)
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const rawEmail: string = typeof body?.rawEmail === 'string' ? body.rawEmail : ''
    if (!rawEmail || rawEmail.length < 10) {
      return new Response(JSON.stringify({ error: 'rawEmail is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (rawEmail.length > 50000) {
      return new Response(JSON.stringify({ error: 'rawEmail too large (max 50000 chars)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawEmail },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limit hit, please try again shortly' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!aiRes.ok) {
      const text = await aiRes.text()
      console.error('AI error', aiRes.status, text)
      return new Response(JSON.stringify({ error: 'AI request failed', partial: true, fields: {} as ParsedLead }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await aiRes.json()
    const content: string = data?.choices?.[0]?.message?.content ?? '{}'
    let fields: ParsedLead = {}
    try {
      fields = JSON.parse(content)
    } catch {
      fields = {}
    }

    return new Response(JSON.stringify({ fields }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('parse-lead-email error', err)
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
