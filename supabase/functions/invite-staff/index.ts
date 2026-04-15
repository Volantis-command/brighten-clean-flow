import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, email, role, full_name, phone, user_id, password } = await req.json();

    // Helper to ensure onboarding record exists for a user
    async function ensureOnboarding(userId: string, name?: string, userEmail?: string) {
      const { data: existing } = await adminClient
        .from("staff_onboarding")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!existing) {
        await adminClient.from("staff_onboarding").insert({
          user_id: userId,
          full_name: name || null,
          email: userEmail || null,
          status: "pending",
        });
      }
    }

    if (action === "create_user") {
      const { data: createData, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: full_name || "" },
        });

      let newUserId: string;
      let existingUser = false;

      if (createError) {
        if (createError.message.includes("already been registered")) {
          const { data: existingUsers, error: listErr } =
            await adminClient.auth.admin.listUsers();
          if (listErr) {
            return new Response(JSON.stringify({ error: listErr.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const existing = existingUsers.users.find((u) => u.email === email);
          if (!existing) {
            return new Response(JSON.stringify({ error: "User not found" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          newUserId = existing.id;
          existingUser = true;

          // Guard: never overwrite an admin's role
          const { data: isExistingAdmin } = await adminClient.rpc("has_role", {
            _user_id: newUserId,
            _role: "admin",
          });
          if (isExistingAdmin) {
            return new Response(
              JSON.stringify({ error: "This email belongs to an admin account and cannot be reassigned." }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        newUserId = createData.user.id;
      }

      // For existing users, upsert role; for new users, insert
      if (existingUser) {
        await adminClient
          .from("user_roles")
          .upsert({ user_id: newUserId, role }, { onConflict: "user_id,role" });
      } else {
        await adminClient.from("user_roles").insert({ user_id: newUserId, role });
      }

      if (phone || full_name) {
        const updates: Record<string, string> = {};
        if (phone) updates.phone = phone;
        if (full_name) updates.full_name = full_name;
        await adminClient.from("profiles").update(updates).eq("id", newUserId);
      }

      // Create onboarding record
      if (role !== 'client') {
        await ensureOnboarding(newUserId, full_name, email);
      }

      return new Response(
        JSON.stringify({ success: true, user_id: newUserId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "invite") {
      const { data: inviteData, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { full_name: full_name || "" },
        });
      if (inviteError) {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newUserId = inviteData.user.id;

      await adminClient
        .from("user_roles")
        .upsert({ user_id: newUserId, role }, { onConflict: "user_id,role" });

      if (phone) {
        await adminClient
          .from("profiles")
          .update({ phone, full_name })
          .eq("id", newUserId);
      }

      // Create onboarding record
      if (role !== 'client') {
        await ensureOnboarding(newUserId, full_name, email);
      }

      return new Response(
        JSON.stringify({ success: true, user_id: newUserId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update_role") {
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").insert({ user_id, role });

      const updates: Record<string, string> = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (phone !== undefined) updates.phone = phone;
      if (Object.keys(updates).length > 0) {
        await adminClient.from("profiles").update(updates).eq("id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove") {
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      // Send password reset email
      const { error: resetErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (resetErr) {
        return new Response(JSON.stringify({ error: resetErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set_password") {
      // Admin sets a new temporary password
      const { error: pwErr } = await adminClient.auth.admin.updateUserById(user_id, {
        password,
      });
      if (pwErr) {
        return new Response(JSON.stringify({ error: pwErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "mark_reviewed") {
      await adminClient
        .from("staff_onboarding")
        .update({
          admin_reviewed_at: new Date().toISOString(),
          admin_reviewed_by: caller.id,
          status: "reviewed",
        })
        .eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ensure_onboarding") {
      // Only create staff_onboarding for staff roles, not clients
      const { data: userRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id);
      const staffRoles = ['cleaner', 'head_cleaner', 'admin'];
      const isStaff = userRoles?.some((r: any) => staffRoles.includes(r.role));

      if (!isStaff) {
        return new Response(
          JSON.stringify({ success: false, error: "User is not a staff member" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await ensureOnboarding(user_id, full_name, email);
      // Return the token
      const { data: record } = await adminClient
        .from("staff_onboarding")
        .select("onboarding_token")
        .eq("user_id", user_id)
        .single();
      return new Response(
        JSON.stringify({ success: true, token: record?.onboarding_token }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "find_or_create_client") {
      // Find existing client by email or phone
      let existingId: string | null = null;

      if (email) {
        const { data: byEmail } = await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (byEmail) existingId = byEmail.id;
      }

      if (!existingId && phone) {
        const { data: byPhone } = await adminClient
          .from("profiles")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();
        if (byPhone) existingId = byPhone.id;
      }

      if (existingId) {
        // Ensure they have the client role
        const { data: hasClientRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", existingId)
          .eq("role", "client")
          .maybeSingle();
        if (!hasClientRole) {
          await adminClient.from("user_roles").insert({ user_id: existingId, role: "client" });
        }
        // Update profile fields if provided
        const updates: Record<string, string> = {};
        if (full_name) updates.full_name = full_name;
        if (phone) updates.phone = phone;
        if (Object.keys(updates).length > 0) {
          await adminClient.from("profiles").update(updates).eq("id", existingId);
        }
        return new Response(
          JSON.stringify({ success: true, user_id: existingId, existing: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create new auth user with random password
      const randomPwd = crypto.randomUUID().slice(0, 16) + "Aa1!";
      const { data: newUser, error: createErr } =
        await adminClient.auth.admin.createUser({
          email: email || `client_${crypto.randomUUID().slice(0, 8)}@placeholder.local`,
          password: randomPwd,
          email_confirm: true,
          user_metadata: { full_name: full_name || "" },
        });

      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newId = newUser.user.id;
      await adminClient.from("user_roles").insert({ user_id: newId, role: "client" });

      const profileUpdates: Record<string, string> = {};
      if (full_name) profileUpdates.full_name = full_name;
      if (phone) profileUpdates.phone = phone;
      if (email) profileUpdates.email = email;
      if (Object.keys(profileUpdates).length > 0) {
        await adminClient.from("profiles").update(profileUpdates).eq("id", newId);
      }

      return new Response(
        JSON.stringify({ success: true, user_id: newId, existing: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
