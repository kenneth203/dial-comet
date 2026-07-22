import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isDuplicateUserError = (message?: string | null) =>
  !!message && (
    message.toLowerCase().includes("already been registered") ||
    message.toLowerCase().includes("database error creating new user") ||
    message.toLowerCase().includes("unique constraint") ||
    message.toLowerCase().includes("already exists")
  );

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const existingUser = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );

    if (existingUser) {
      return existingUser;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      console.error("Missing required Supabase environment variables");
      return jsonResponse({ error: "Unable to create user." }, 500);
    }

    if (!accessToken) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: callingUser },
      error: authError,
    } = await userClient.auth.getUser(accessToken);

    if (authError || !callingUser) {
      console.error("Auth validation failed", authError?.message);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: isAdmin, error: adminCheckError } = await userClient.rpc("is_admin_or_higher");

    if (adminCheckError || !isAdmin) {
      console.error("Admin check failed", adminCheckError?.message);
      return jsonResponse({ error: "Access denied" }, 403);
    }

    // Fetch the caller's own role for role-ceiling enforcement
    const { data: callerProfile, error: callerProfileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("user_id", callingUser.id)
      .single();

    if (callerProfileError || !callerProfile) {
      console.error("Failed to fetch caller profile", callerProfileError?.message);
      return jsonResponse({ error: "Unable to verify caller privileges." }, 500);
    }

    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const userData = body.userData ?? {};

    // Role ceiling validation — prevent privilege escalation
    const VALID_ROLES = ["Operator", "Supervisor", "HR", "Admin", "Super-Admin"];
    const ROLE_CEILING: Record<string, string[]> = {
      "Operator": [],
      "Supervisor": ["Operator"],
      "HR": ["Operator"],
      "Admin": ["Operator", "Supervisor", "HR"],
      "Super-Admin": VALID_ROLES,
    };

    const requestedRole =
      typeof userData.role === "string" && VALID_ROLES.includes(userData.role)
        ? userData.role
        : "Operator";

    const allowedRoles = ROLE_CEILING[callerProfile.role] ?? ["Operator"];
    if (!allowedRoles.includes(requestedRole)) {
      return jsonResponse(
        { error: "Cannot assign a role equal to or higher than your own." },
        403,
      );
    }

    if (!email || !password) {
      return jsonResponse({ error: "Email and password are required." }, 400);
    }

    let authUserId: string | null = null;
    let createdAuthUser = false;

    const { data: createdUserData, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createAuthError) {
      if (isDuplicateUserError(createAuthError.message)) {
        const existingAuthUser = await findAuthUserByEmail(adminClient, email);

        if (!existingAuthUser) {
          console.error("Duplicate email reported but existing auth user was not found", email);
          return jsonResponse({ error: "A user with this email already exists." }, 409);
        }

        authUserId = existingAuthUser.id;
      } else {
        console.error("Create auth user error", createAuthError.message);
        return jsonResponse({ error: "Unable to create user account." }, 400);
      }
    } else {
      authUserId = createdUserData.user?.id ?? null;
      createdAuthUser = true;
    }

    if (!authUserId) {
      return jsonResponse({ error: "Unable to create user account." }, 500);
    }

    const { data: existingSystemUserByUserId, error: existingSystemUserError } = await adminClient
      .from("system_users")
      .select("id")
      .eq("user_id", authUserId)
      .maybeSingle();

    if (existingSystemUserError) {
      console.error("Failed checking existing system user by user id", existingSystemUserError.message);
      return jsonResponse({ error: "Unable to create user." }, 500);
    }

    // If system_user already exists (e.g. after a database reset that kept some records),
    // update it and return success instead of 409
    if (existingSystemUserByUserId) {
      const { error: updateError } = await adminClient
        .from("system_users")
        .update({
          name: userData.name,
          email,
          role: requestedRole,
          status: userData.status || "Active",
          position: userData.jobTitle || null,
          department: userData.department || null,
          phone_number: userData.mobilePhone || null,
          annual_leave_entitlement: userData.annualLeaveDays ?? 25,
          start_date: userData.startDate || null,
        })
        .eq("id", existingSystemUserByUserId.id);

      if (updateError) {
        console.error("Failed updating existing system user", updateError.message);
        return jsonResponse({ error: "Unable to update existing user." }, 500);
      }

      // Also upsert comprehensive_users and profiles
      await adminClient.from("comprehensive_users").upsert({
        auth_user_id: authUserId,
        name: userData.name,
        email,
        role: requestedRole,
        status: userData.status || "Active",
        department: userData.department || null,
        job_position: userData.jobTitle || null,
        start_date: userData.startDate || null,
        annual_leave_entitlement: userData.annualLeaveDays ?? 25,
        is_system_user: true,
        is_staff_member: true,
      }, { onConflict: "auth_user_id" });

      await adminClient.from("profiles").upsert({
        user_id: authUserId,
        name: userData.name,
        role: requestedRole,
        status: "Active",
      }, { onConflict: "user_id" });

      return jsonResponse({ success: true, userId: authUserId, systemUserId: existingSystemUserByUserId.id });
    }

    const { data: existingSystemUserByEmail, error: existingSystemUserByEmailError } = await adminClient
      .from("system_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingSystemUserByEmailError) {
      console.error("Failed checking existing system user by email", existingSystemUserByEmailError.message);
      return jsonResponse({ error: "Unable to create user." }, 500);
    }

    if (existingSystemUserByEmail) {
      if (createdAuthUser) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }

      return jsonResponse({ error: "A user with this email already exists." }, 409);
    }

    const { data: systemUser, error: systemUserError } = await adminClient
      .from("system_users")
      .insert({
        user_id: authUserId,
        name: userData.name,
        email,
        role: requestedRole,
        status: userData.status || "Active",
        position: userData.jobTitle || null,
        department: userData.department || null,
        phone_number: userData.mobilePhone || null,
        annual_leave_entitlement: userData.annualLeaveDays ?? 25,
        start_date: userData.startDate || null,
      })
      .select("id")
      .single();

    if (systemUserError) {
      console.error("System user insert error", systemUserError.message);

      if (createdAuthUser) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }

      return jsonResponse({ error: "Unable to create user record." }, 500);
    }

    // Also insert into comprehensive_users for dropdown/chat visibility
    const { error: compUserError } = await adminClient
      .from("comprehensive_users")
      .insert({
        auth_user_id: authUserId,
        name: userData.name,
        email,
        role: requestedRole,
        status: userData.status || "Active",
        department: userData.department || null,
        job_position: userData.jobTitle || null,
        start_date: userData.startDate || null,
        annual_leave_entitlement: userData.annualLeaveDays ?? 25,
        is_system_user: true,
        is_staff_member: true,
      });

    if (compUserError) {
      console.error("Comprehensive user insert error (non-fatal)", compUserError.message);
    }

    const { data: existingProfile, error: existingProfileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", authUserId)
      .maybeSingle();

    if (existingProfileError) {
      console.error("Profile lookup error", existingProfileError.message);
    } else if (!existingProfile) {
      const { error: profileError } = await adminClient.from("profiles").insert({
        user_id: authUserId,
        name: userData.name,
        role: requestedRole,
        status: "Active",
      });

      if (profileError) {
        console.error("Profile insert error", profileError.message);
      }
    }

    return jsonResponse({ success: true, userId: authUserId, systemUserId: systemUser.id });
  } catch (error) {
    console.error("Unexpected error", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "Unable to create user." }, 500);
  }
});
