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
    const { token, selectedPackage, formData, agreementData, addons } = await req.json();
    // SECURITY: Addon prices are authoritative server-side constants — never trust client.
    const WEEKEND_COVER_FEE = 99;
    const ADDITIONAL_LINES_FEE = 20;
    const weekendCoverOn = !!addons?.weekendCover;
    const additionalLinesOn = !!addons?.additionalLines;
    const weekendCoverFee = weekendCoverOn ? WEEKEND_COVER_FEE : 0;
    const additionalLinesFee = additionalLinesOn ? ADDITIONAL_LINES_FEE : 0;
    const addonsTotal = weekendCoverFee + additionalLinesFee;

    if (!token || !selectedPackage) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the proposal token
    const { data: proposal, error: fetchError } = await supabase
      .from("proposal_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (fetchError || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), { status: 404, headers: corsHeaders });
    }

    if (proposal.status === "completed") {
      return new Response(JSON.stringify({ error: "Proposal already submitted" }), { status: 400, headers: corsHeaders });
    }

    if (proposal.status === "expired" || new Date(proposal.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Proposal has expired" }), { status: 410, headers: corsHeaders });
    }

    // SECURITY: Validate selectedPackage against the proposal's stored packages
    const proposalData = proposal.proposal_data as any;
    const packagesSnapshot = proposalData?.packages || proposalData?.packages_snapshot || [];
    
    // Find the matching package from the server-side snapshot
    const validPkg = packagesSnapshot.find(
      (p: any) => p.name === selectedPackage?.name
    );
    
    if (!validPkg) {
      return new Response(JSON.stringify({ error: "Invalid package selection" }), { status: 400, headers: corsHeaders });
    }

    // Use server-side validated package data instead of client-supplied values
    const trustedPackage = validPkg;

    const now = new Date().toISOString();
    const proposalRecord = {
      id: crypto.randomUUID(),
      serviceType: proposal.service_type,
      packageName: trustedPackage.name,
      packagePrice: trustedPackage.price,
      invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
      clientName: formData?.firstName && formData?.lastName
        ? `${formData.firstName} ${formData.lastName}`
        : (proposal.customer_snapshot as any)?.name || "Client",
      companyName: formData?.companyName || (proposal.customer_snapshot as any)?.companyName || "",
      clientAddress: agreementData?.clientAddress || "",
      signedAt: now,
      agreementInitials: agreementData?.initials || "",
      status: "signed",
    };

    // 1. Update proposal_tokens row
    const { error: updateError } = await supabase
      .from("proposal_tokens")
      .update({
        status: "completed",
        completed_at: now,
        selected_package: trustedPackage,
        proposal_record: proposalRecord,
      })
      .eq("id", proposal.id);

    if (updateError) {
      console.error("Update proposal error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save proposal" }), { status: 500, headers: corsHeaders });
    }

    // 2. Update customer record with validated package data
    const customerId = proposal.customer_id;
    const serviceType = proposal.service_type;

    // Fetch current customer to merge lead_metadata
    const { data: customer } = await supabase
      .from("customers")
      .select("lead_metadata, va_package, vr_package, ai_package, dt_package, address, address_line1, address_line2, city, postcode, tel, mobile, email, contact, name")
      .eq("id", customerId)
      .single();

    const currentMetadata = (customer?.lead_metadata || {}) as any;
    const existingProposals = currentMetadata.proposals || [];
    const submittedAddress = (formData?.address || agreementData?.clientAddress || "").trim();
    const heardAbout = (formData?.heardAbout || "").trim();
    const updatedMetadata = {
      ...currentMetadata,
      proposals: [...existingProposals, proposalRecord],
      ...(heardAbout ? { heardAbout, heardAboutSource: heardAbout } : {}),
    };

    // Build the customer update using TRUSTED server-side package values
    const customerUpdate: Record<string, any> = {
      lead_metadata: updatedMetadata,
    };

    // Copy address details from signed proposal into main customer fields.
    // Only fill fields that are currently empty so we never overwrite existing data.
    if (submittedAddress) {
      customerUpdate.address = submittedAddress;

      // Parse UK-style address: "<line1>, <line2>, <city>, <postcode>" or space-separated.
      // Extract postcode via strict UK regex (Royal Mail / GOV.UK format) and
      // normalise to canonical uppercase with a single space (e.g. "SW1A 1AA").
      // Keep this in sync with src/lib/ukPostcode.ts.
      const UK_POSTCODE_RE =
        /\b(GIR\s?0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9]|[ABEHMNPRV-Y])?)|[0-9][A-HJKPS-UW])\s?[0-9][ABD-HJLNP-UW-Z]{2})\b/i;
      const postcodeMatch = submittedAddress.match(UK_POSTCODE_RE);
      const rawPostcode = postcodeMatch ? postcodeMatch[0] : "";
      // Canonical format: uppercase, single space before the final 3 chars.
      const compact = rawPostcode.replace(/\s+/g, "").toUpperCase();
      const postcode = compact.length >= 5
        ? `${compact.slice(0, compact.length - 3)} ${compact.slice(-3)}`
        : "";
      const withoutPostcode = rawPostcode
        ? submittedAddress.replace(rawPostcode, "").replace(/,\s*$/, "").trim()
        : submittedAddress;


      const parts = withoutPostcode.includes(",")
        ? withoutPostcode.split(",").map((s) => s.trim()).filter(Boolean)
        : [withoutPostcode.trim()].filter(Boolean);

      let line1 = "";
      let line2 = "";
      let city = "";
      if (parts.length >= 3) {
        line1 = parts[0];
        line2 = parts.slice(1, parts.length - 1).join(", ");
        city = parts[parts.length - 1];
      } else if (parts.length === 2) {
        line1 = parts[0];
        city = parts[1];
      } else if (parts.length === 1) {
        line1 = parts[0];
      }

      if (line1 && !(customer?.address_line1 || "").trim()) customerUpdate.address_line1 = line1;
      if (line2 && !(customer?.address_line2 || "").trim()) customerUpdate.address_line2 = line2;
      if (city && !(customer?.city || "").trim()) customerUpdate.city = city;
      if (postcode && !(customer?.postcode || "").trim()) customerUpdate.postcode = postcode;
    }

    // Copy contact details from signed proposal into main customer fields, only if empty.
    const submittedEmail = (formData?.email || "").trim();
    const submittedTel = (formData?.telephone || formData?.tel || "").trim();
    const submittedCompany = (formData?.companyName || "").trim();
    const submittedContact = [formData?.firstName, formData?.lastName].filter(Boolean).join(" ").trim();

    if (submittedEmail && !(customer?.email || "").trim()) customerUpdate.email = submittedEmail;
    if (submittedTel && !(customer?.tel || "").trim() && !(customer?.mobile || "").trim()) {
      customerUpdate.tel = submittedTel;
    }
    if (submittedContact && !(customer?.contact || "").trim()) customerUpdate.contact = submittedContact;
    if (submittedCompany && !(customer?.name || "").trim()) customerUpdate.name = submittedCompany;

    switch (serviceType) {
      case "VA":
        customerUpdate.va_package = trustedPackage.name;
        customerUpdate.va_packaged_hours = trustedPackage.packagedHours || trustedPackage.hours || 0;
        customerUpdate.va_hourly_overage_rate = trustedPackage.hourlyOverageRate || trustedPackage.additionalRate || 0;
        break;
      case "VR":
        customerUpdate.vr_package = trustedPackage.name;
        customerUpdate.vr_price = trustedPackage.price || 0;
        customerUpdate.vr_included_minutes = trustedPackage.minutes || trustedPackage.calls || 0;
        customerUpdate.vr_overage_rate = trustedPackage.overage || trustedPackage.additionalRate || 0;
        break;
      case "AI":
        customerUpdate.ai_package = trustedPackage.name;
        customerUpdate.ai_setup_fee = trustedPackage.aiSetupFee || trustedPackage.setupFee || 0;
        customerUpdate.ai_monthly_fee = trustedPackage.aiMonthlyFee || trustedPackage.monthlyFee || 0;
        customerUpdate.ai_calls_allocated = trustedPackage.aiCallsAllocated || trustedPackage.callsAllocated || 0;
        break;
      case "DT":
        customerUpdate.dt_package = trustedPackage.name;
        customerUpdate.dt_price_per_minute = trustedPackage.digitalPricePerMinute || trustedPackage.pricePerMinute || 0;
        break;
    }

    const { error: customerError } = await supabase
      .from("customers")
      .update(customerUpdate)
      .eq("id", customerId);

    if (customerError) {
      console.error("Customer update error:", customerError);
      // Don't fail the whole request - proposal is saved
    }

    // 3. Auto-raise an invoice for the selected package
    const basePrice = Number(trustedPackage.price ?? 0);
    const subtotal = Math.round((basePrice + addonsTotal) * 100) / 100;
    const vatRate = 0.20;
    const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;

    const addonLabels: string[] = [];
    if (weekendCoverOn) addonLabels.push("Weekend Cover");
    if (additionalLinesOn) addonLabels.push("Additional Lines");
    // Keep package_name as the trusted base name; addons are itemised in line_items
    const decoratedPackageName = trustedPackage.name;

    const lineItems: Array<{ description: string; quantity: number; unit_price: number; amount: number }> = [
      {
        description: `${trustedPackage.name}${serviceType ? ` (${serviceType})` : ""}`,
        quantity: 1,
        unit_price: basePrice,
        amount: basePrice,
      },
    ];
    if (weekendCoverOn) {
      lineItems.push({ description: "Weekend Cover", quantity: 1, unit_price: weekendCoverFee, amount: weekendCoverFee });
    }
    if (additionalLinesOn) {
      lineItems.push({ description: "Additional Lines", quantity: 1, unit_price: additionalLinesFee, amount: additionalLinesFee });
    }

    const { data: invoiceRow, error: invoiceError } = await supabase
      .from("proposal_invoices")
      .insert({
        customer_id: customerId,
        proposal_token_id: proposal.id,
        invoice_number: proposalRecord.invoiceNumber,
        service_type: serviceType,
        package_name: decoratedPackageName,
        package_price: subtotal,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        status: "pending",
        client_name: proposalRecord.clientName,
        company_name: proposalRecord.companyName,
        client_address: proposalRecord.clientAddress,
        created_by: proposal.created_by,
        line_items: lineItems,
      })
      .select("id, issued_at, due_at, invoice_number")
      .single();

    if (invoiceError) {
      console.error("Invoice insert error:", invoiceError);
    }

    // 3b. Auto-email the invoice to the customer
    let invoiceEmailed = false;
    const recipientEmail = formData?.email || (proposal.customer_snapshot as any)?.email;
    if (invoiceRow && recipientEmail) {
      try {
        const { error: emailErr } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "proposal-invoice",
            recipientEmail,
            idempotencyKey: `proposal-invoice-auto-${invoiceRow.id}`,
            templateData: {
              invoiceNumber: invoiceRow.invoice_number,
              clientName: proposalRecord.clientName,
              companyName: proposalRecord.companyName,
              serviceType,
              packageName: trustedPackage.name,
              subtotal,
              vatAmount,
              total,
              issuedAt: invoiceRow.issued_at,
              dueAt: invoiceRow.due_at,
            },
          },
        });
        if (emailErr) {
          console.error("Auto-email invoice error:", emailErr);
        } else {
          invoiceEmailed = true;
          await supabase.from("proposal_invoices").update({
            status: "sent",
            last_emailed_at: now,
          }).eq("id", invoiceRow.id);
        }
      } catch (e) {
        console.error("Auto-email invoice exception:", e);
      }
    }

    // 3c. Internal notification email to Kenneth — new sign-up + invoice + onboarding questionnaire
    try {
      const { error: internalErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "proposal-signed-internal",
          recipientEmail: "kenneth@thevateam.co.uk",
          idempotencyKey: `proposal-signed-internal-${invoiceRow?.id || proposal.id}`,
          templateData: {
            clientName: proposalRecord.clientName,
            companyName: proposalRecord.companyName,
            clientEmail: recipientEmail,
            clientAddress: proposalRecord.clientAddress,
            heardAbout: (formData?.heardAbout || "").trim() || undefined,
            serviceType,
            packageName: trustedPackage.name,
            invoiceNumber: proposalRecord.invoiceNumber,
            subtotal,
            vatAmount,
            total,
            signedAt: now,
          },
        },
      });
      if (internalErr) console.error("Internal signup email error:", internalErr);
    } catch (e) {
      console.error("Internal signup email exception:", e);
    }


    // 4. Create notification for the staff member who sent the proposal
    const clientName = proposalRecord.clientName || "A client";
    const { error: notifError } = await supabase
      .from("task_notifications")
      .insert({
        recipient_user_id: proposal.created_by,
        sender_user_id: proposal.created_by,
        task_title: `🎉 New sign-up! ${clientName} completed your ${serviceType} proposal — selected "${selectedPackage.name}" (Invoice ${proposalRecord.invoiceNumber} raised)`,
        task_id: proposal.id,
        customer_name: clientName,
        assignee_name: null,
        status: "sent",
      });

    if (notifError) {
      console.error("Notification insert error:", notifError);
    }

    return new Response(JSON.stringify({ success: true, proposalRecord, invoiceEmailed, recipientEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
