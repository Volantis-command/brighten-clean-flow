// Sets a staff member's password during onboarding.
// Called from StaffOnboardingPage after the cleaner fills in their form.
// Uses the service role key to update the auth user's password.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, function: 'set-staff-password' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const raw = await req.text();
    if (!raw) {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { onboarding_token, password } = JSON.parse(raw);

    if (!onboarding_token) {
      return new Response(JSON.stringify({ error: "onboarding_token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the onboarding token is valid
    const { data: onboarding, error: obErr } = await supabase
      .from("staff_onboarding")
      .select("user_id, full_name, email")
      .eq("onboarding_token", onboarding_token)
      .maybeSingle();

    if (obErr || !onboarding) {
      return new Response(JSON.stringify({ error: "Invalid onboarding token" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!onboarding.user_id) {
      return new Response(JSON.stringify({ error: "Onboarding record has no user_id" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the auth user actually exists
    const { data: authUser, error: userErr } = await supabase.auth.admin.getUserById(onboarding.user_id);
    if (userErr || !authUser?.user) {
      return new Response(JSON.stringify({
        error: "Auth user not found for this staff member. Admin needs to re-create the account.",
        detail: userErr?.message,
      }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set the password AND mark email as confirmed (so the user can sign in immediately)
    // CRITICAL: use updateUserById, NOT updateUser (which doesn't exist on admin client)
    const { error: pwErr } = await supabase.auth.admin.updateUserById(
      onboarding.user_id,
      {
        password,
        email_confirm: true, // ensure confirmed so signInWithPassword works
      }
    );

    if (pwErr) {
      return new Response(JSON.stringify({ error: "Failed to set password: " + pwErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return the email the auth user actually has (not the form email — they must match for sign-in)
    const email = authUser.user.email || onboarding.email;

    return new Response(
      JSON.stringify({ success: true, email, user_id: onboarding.user_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("set-staff-password error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
