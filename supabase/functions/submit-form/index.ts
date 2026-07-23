import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { assertPublicEndpointAllowed } from '../_shared/public-endpoint-guard.ts';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  const guard = assertPublicEndpointAllowed(req);
  if (guard) return guard;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submissionId, responses } = await req.json();

    if (!submissionId || !responses) {
      return new Response(JSON.stringify({ error: "Submission ID and responses required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify submission exists and is pending
    const { data: submission, error: fetchErr } = await supabase
      .from("form_submissions")
      .select("id, status, customer_id, form_template_id")
      .eq("id", submissionId)
      .single();

    if (fetchErr || !submission) {
      return new Response(JSON.stringify({ error: "Form not found" }), { status: 404, headers: corsHeaders });
    }

    if (submission.status === "completed") {
      return new Response(JSON.stringify({ error: "Form already submitted" }), { status: 400, headers: corsHeaders });
    }

    const completedAt = new Date().toISOString();

    // Update the submission
    const { error: updateErr } = await supabase
      .from("form_submissions")
      .update({
        responses,
        status: "completed",
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", submissionId);

    if (updateErr) {
      console.error("Update error:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to save responses" }), { status: 500, headers: corsHeaders });
    }

    // Fire-and-forget internal notification email to Kenneth
    try {
      const [{ data: customer, error: custErr }, { data: tpl }] = await Promise.all([
        submission.customer_id
          ? supabase.from("customers").select("name, email").eq("id", submission.customer_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        submission.form_template_id
          ? supabase.from("form_templates").select("name").eq("id", submission.form_template_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (custErr) console.error("Customer lookup failed:", custErr);

      const c = customer as any;
      const customerName =
        c?.name || c?.email || "Unknown customer";
      const formName = (tpl as any)?.name || "Form";
      const submittedAt = new Date(completedAt).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "form-submitted-internal",
          recipientEmail: "kenneth@thevateam.co.uk",
          idempotencyKey: `form-submitted-${submissionId}`,
          templateData: {
            customerName,
            formName,
            submittedAt,
            reviewUrl: submission.customer_id
              ? `https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app/customers?customerId=${submission.customer_id}`
              : "https://id-preview--8b31b9e2-c03e-432c-8f58-7a093ded151c.lovable.app/customers",
          },
        },
      });
    } catch (notifyErr) {
      console.error("Internal notification email failed (non-fatal):", notifyErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
