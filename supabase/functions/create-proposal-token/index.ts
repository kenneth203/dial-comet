import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { assertPublicEndpointAllowed } from '../_shared/public-endpoint-guard.ts';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateToken(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  const guard = assertPublicEndpointAllowed(req);
  if (guard) return guard;
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: claims, error: authError } = await authClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claims.claims.sub as string;

    // Role gate: only Super-Admin / Supervisor / Admin can mint proposal tokens
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const ALLOWED_ROLES = ["Super-Admin", "Supervisor", "Admin"];
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Insufficient privileges" }), { status: 403, headers: corsHeaders });
    }

    const { customerId, serviceType, packagesSnapshot, customerSnapshot } = await req.json();

    if (!customerId || !serviceType || !Array.isArray(packagesSnapshot) || packagesSnapshot.length === 0) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const safeCustomerSnapshot = customerSnapshot || {};

    const { data, error } = await supabase
      .from("proposal_tokens")
      .insert({
        customer_id: customerId,
        token,
        expires_at: expiresAt,
        service_type: serviceType,
        packages_snapshot: packagesSnapshot,
        customer_snapshot: safeCustomerSnapshot,
        proposal_data: {
          service_type: serviceType,
          packages_snapshot: packagesSnapshot,
          customer_snapshot: safeCustomerSnapshot,
        },
        created_by: userId,
        status: "pending",
      })
      .select("id, token, expires_at")
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ token: data.token, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});
