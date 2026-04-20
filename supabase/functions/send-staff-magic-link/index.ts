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

    // Create magic token
    const { data: tokenRow, error: tokenErr } = await adminClient
      .from("staff_magic_tokens")
      .insert({ staff_id })
      .select("token")
      .single();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: "Failed to create token" }), { status: 500, headers: corsHeaders });
    }

    const appUrl = Deno.env.get("APP_URL") || "https://app.brightly.cleaning";
    const loginUrl = `${appUrl}/auth/staff?token=${tokenRow.token}`;

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
          Body: `Brightly login: ${loginUrl} — expires in 15 minutes`,
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
