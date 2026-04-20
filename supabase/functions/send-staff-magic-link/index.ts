import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getUser();
    if (claimsErr || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check admin role
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", claimsData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: corsHeaders });
    }

    const { staff_id } = await req.json();
    if (!staff_id) {
      return new Response(JSON.stringify({ error: "staff_id required" }), { status: 400, headers: corsHeaders });
    }

    // Get staff profile
    const { data: profile, error: profErr } = await adminClient
      .from("profiles")
      .select("id, full_name, phone, email")
      .eq("id", staff_id)
      .single();

    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: "Staff member not found" }), { status: 404, headers: corsHeaders });
    }

    if (!profile.phone) {
      return new Response(JSON.stringify({ error: "No phone number on file" }), { status: 400, headers: corsHeaders });
    }

    // Format phone to E.164 (Twilio requires +61...)
    let formattedPhone = profile.phone.replace(/[\s\-()]/g, '');
    if (formattedPhone.startsWith('+61')) { /* already E.164 */ }
    else if (formattedPhone.startsWith('61') && formattedPhone.length >= 11) { formattedPhone = '+' + formattedPhone; }
    else if (formattedPhone.startsWith('0')) { formattedPhone = '+61' + formattedPhone.slice(1); }
    else { formattedPhone = '+61' + formattedPhone; }

    // Generate a proper Supabase magic link — this creates a one-time token
    // that auto-signs the user in when clicked. No password needed.
    const appUrl = Deno.env.get("APP_URL") || "https://app.brightly.cleaning";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: { redirectTo: `${appUrl}/dashboard` },
    });

    if (linkErr || !linkData) {
      console.error("generateLink error:", linkErr);
      return new Response(JSON.stringify({ error: "Failed to generate login link" }), { status: 500, headers: corsHeaders });
    }

    // Build the verification URL the cleaner will click
    const hashedToken = linkData.properties?.hashed_token;
    const loginUrl = hashedToken
      ? `${supabaseUrl}/auth/v1/verify?token=${hashedToken}&type=magiclink&redirect_to=${encodeURIComponent(appUrl + '/dashboard')}`
      : `${appUrl}/auth/staff`;

    // Also store a record in staff_magic_tokens for audit trail
    await adminClient.from("staff_magic_tokens").insert({ staff_id }).select().maybeSingle();

    // Send SMS via Twilio
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const smsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
        },
        body: new URLSearchParams({
          To: formattedPhone,
          From: twilioFrom,
          Body: `Brightly login: ${loginUrl}\n\nTap to sign in — no password needed. Link expires in 1 hour.`,
        }),
      }
    );

    if (!smsRes.ok) {
      const smsErr = await smsRes.text();
      console.error("Twilio error:", smsErr);
      return new Response(JSON.stringify({ error: "Failed to send SMS" }), { status: 500, headers: corsHeaders });
    }

    // Log alert
    const { createAlert } = await import("./alertHelper.ts").catch(() => ({ createAlert: null }));
    // Inline alert creation since we can't import from src/
    await adminClient.from("notifications").insert({
      user_id: claimsData.user.id,
      title: "Magic link sent",
      message: `Login link sent to ${profile.full_name || "staff"} via SMS`,
      type: "staff_magic_link_sent",
      tier: "info",
      event_type: "staff_magic_link_sent",
      read: false,
    });

    return new Response(
      JSON.stringify({ success: true, phone: profile.phone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
