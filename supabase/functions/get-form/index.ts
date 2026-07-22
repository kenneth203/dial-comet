import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const submissionId = url.searchParams.get("id");

    if (!submissionId) {
      return new Response(JSON.stringify({ error: "Submission ID required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the submission
    const { data: submission, error: subError } = await supabase
      .from("form_submissions")
      .select("id, form_template_id, customer_id, status, responses, completed_at")
      .eq("id", submissionId)
      .single();

    if (subError || !submission) {
      return new Response(JSON.stringify({ error: "Form not found" }), { status: 404, headers: corsHeaders });
    }

    // Load customer prefill data (only used before form is completed).
    let prefill: Record<string, string> | null = null;
    if (submission.customer_id && submission.status !== "completed") {
      const { data: customer } = await supabase
        .from("customers")
        .select("name, contact, contacts, email, tel, phone, mobile, website, address_line1, address_line2, city, postcode")
        .eq("id", submission.customer_id)
        .maybeSingle();

      if (customer) {
        let firstName = "";
        let lastName = "";
        const contactsArr = Array.isArray(customer.contacts) ? customer.contacts : [];
        const primary = contactsArr.find((c: any) => c && (c.isPrimary || c.primary)) || contactsArr[0];
        if (primary) {
          firstName = primary.firstName || primary.first_name || "";
          lastName = primary.lastName || primary.last_name || primary.surname || "";
          if (!firstName && !lastName && primary.name) {
            const parts = String(primary.name).trim().split(/\s+/);
            firstName = parts[0] || "";
            lastName = parts.slice(1).join(" ");
          }
        }
        if (!firstName && !lastName && customer.contact) {
          const parts = String(customer.contact).trim().split(/\s+/);
          firstName = parts[0] || "";
          lastName = parts.slice(1).join(" ");
        }

        prefill = {
          companyName: customer.name || "",
          contactFirstName: firstName,
          contactLastName: lastName,
          email: customer.email || "",
          telephone: customer.tel || customer.phone || "",
          mobile: customer.mobile || "",
          website: customer.website || "",
          addressLine1: customer.address_line1 || "",
          addressLine2: customer.address_line2 || "",
          city: customer.city || "",
          postcode: customer.postcode || "",
        };
      }
    }

    // Get the form template
    const { data: template, error: tplError } = await supabase
      .from("form_templates")
      .select("id, name, description, elements, brand_color, form_type")
      .eq("id", submission.form_template_id)
      .single();

    if (tplError || !template) {
      return new Response(JSON.stringify({ error: "Form template not found" }), { status: 404, headers: corsHeaders });
    }

    const isCompleted = submission.status === "completed";

    return new Response(JSON.stringify({
      submission: {
        id: submission.id,
        status: submission.status,
        // Do not return previously submitted responses to anonymous callers.
        // Once a form is completed, only expose the status + completion timestamp.
        responses: isCompleted ? null : submission.responses,
        completed_at: submission.completed_at,
      },
      template: {
        name: template.name,
        description: template.description,
        elements: template.elements,
        brandColor: template.brand_color,
      },
      prefill,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
