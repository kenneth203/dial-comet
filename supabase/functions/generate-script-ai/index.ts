// AI-assisted customer script generator.
// Takes raw content (form responses, docx/pdf text, or pasted text) plus
// optional customer context, and returns a formatted HTML script that
// operators will see in the Quick Script modal.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const SYSTEM_PROMPT = `You are an expert receptionist-script writer for The VA Team.
You receive raw information about a business (from an onboarding form, a Word document, a PDF, or pasted notes) and turn it into a clean, operator-friendly HTML script.

Follow this structure (omit any section that has no data):
1. <h2>Greeting</h2> — a short friendly opener that includes the company name.
2. <h2>About the business</h2> — 2-4 concise bullets covering what the business does, hours, and any key selling points.
3. <h2>Quick reference</h2> — an HTML <table> with two columns (Item / Details) covering: main phone, email, website, address, opening hours, key contact(s), out-of-hours policy — one row per item you have data for.
4. <h2>Frequently asked questions</h2> — each Q as <h3> and answer as <p> or bullet list. Include booking, pricing, cancellations, directions, insurance, emergencies, etc. when relevant.
5. <h2>Handling calls</h2> — bulleted instructions: how to greet, how to qualify, when to transfer, when to take a message, when to escalate.
6. <h2>Do NOT</h2> — bullets of things the operator must never say or do (only include if the source mentions restrictions/compliance).

RULES:
- Output ONLY valid semantic HTML (h2, h3, p, ul, ol, li, strong, em, table, thead, tbody, tr, th, td). NO <html>, <body>, <head>, <style>, or <script> tags. NO markdown fences.
- Use <table> for any structured comparison. Use <ul> for lists.
- Be faithful to the source — never invent phone numbers, prices, hours, or policies.
- Keep tone warm and professional. UK English. Currency in GBP (£).
- If information is missing for a section, skip that section entirely rather than writing "TBD".`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI is not configured for this project.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Require authenticated user (prevents anonymous abuse of paid AI gateway)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await authClient.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawContent: string = typeof body.content === 'string' ? body.content : '';
    const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
    const extraInstructions: string = typeof body.instructions === 'string' ? body.instructions : '';

    if (!rawContent.trim()) {
      return new Response(
        JSON.stringify({ error: 'No content provided.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Hard cap input size to avoid runaway prompts.
    const MAX_CHARS = 40_000;
    const content = rawContent.length > MAX_CHARS ? rawContent.slice(0, MAX_CHARS) : rawContent;

    const userMessage = `CUSTOMER CONTEXT (JSON, may be partial):
${JSON.stringify(customer, null, 2)}

SOURCE MATERIAL:
"""
${content}
"""

${extraInstructions ? `EXTRA INSTRUCTIONS FROM USER:\n${extraInstructions}\n` : ''}
Write the operator script now. Output HTML only.`;

    const aiRes = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      console.error(`AI gateway error [${aiRes.status}]: ${errBody}`);
      return new Response(
        JSON.stringify({ error: 'AI generation failed', status: aiRes.status, details: errBody }),
        { status: aiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await aiRes.json();
    let html: string = data?.choices?.[0]?.message?.content || '';

    // Strip accidental markdown fences.
    html = html.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();

    return new Response(
      JSON.stringify({ html }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-script-ai crashed:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
