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

  try {
    const { onboarding_token, password } = await req.json();

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
      .select("user_id, full_name")
      .eq("onboarding_token", onboarding_token)
      .maybeSingle();

    if (obErr || !onboarding) {
      return new Response(JSON.stringify({ error: "Invalid onboarding token" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set the password on the auth user
    const { error: pwErr } = await supabase.auth.admin.updateUser(
      onboarding.user_id,
      { password }
    );

    if (pwErr) {
      return new Response(JSON.stringify({ error: "Failed to set password: " + pwErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get email for the sign-in response
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", onboarding.user_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ success: true, email: profile?.email, user_id: onboarding.user_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("set-staff-password error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
