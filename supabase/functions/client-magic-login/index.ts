import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if email exists in client_properties -> profiles or directly in properties client contacts
    // Look up by checking properties.billing_email or client_properties joined with profiles
    const { data: props } = await supabase
      .from("properties")
      .select("id, client_name, client_phone, billing_email")
      .ilike("billing_email", email.trim());

    // Also check profiles for client role users
    const { data: profileMatch } = await supabase
      .from("profiles")
      .select("id, full_name, phone, email")
      .ilike("email", email.trim());

    // Find client role profiles
    let clientProfile: any = null;
    if (profileMatch && profileMatch.length > 0) {
      for (const p of profileMatch) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", p.id)
          .eq("role", "client")
          .maybeSingle();
        if (roleData) {
          clientProfile = p;
          break;
        }
      }
    }

    // Also check quote_requests for matching email  
    const { data: quoteMatch } = await supabase
      .from("quote_requests")
      .select("id, first_name, last_name, phone, email")
      .ilike("email", email.trim())
      .limit(1);

    const name = clientProfile?.full_name
      || (props && props.length > 0 ? props[0].client_name : null)
      || (quoteMatch && quoteMatch.length > 0 ? `${quoteMatch[0].first_name || ''} ${quoteMatch[0].last_name || ''}`.trim() : null);

    const phone = clientProfile?.phone
      || (props && props.length > 0 ? props[0].client_phone : null)
      || (quoteMatch && quoteMatch.length > 0 ? quoteMatch[0].phone : null);

    const clientId = clientProfile?.id
      || (props && props.length > 0 ? props[0].id : null)
      || (quoteMatch && quoteMatch.length > 0 ? quoteMatch[0].id : null);

    if (!clientId || !phone) {
      return new Response(
        JSON.stringify({ error: "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabase.from("client_tokens").insert({
      email: email.trim().toLowerCase(),
      token,
      expires_at: expiresAt,
      used: false,
    });

    // Get app URL from settings or use default
    const { data: urlSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "app_url")
      .maybeSingle();

    const appUrl = urlSetting?.value || "https://brighten-clean-flow.lovable.app";
    const portalUrl = `${appUrl}/client-portal/verify?token=${token}`;
    const firstName = name?.split(" ")[0] || "there";

    // Send SMS
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (twilioSid && twilioAuth && twilioPhone) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${twilioSid}:${twilioAuth}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          From: twilioPhone,
          Body: `Hi ${firstName}, here's your Brightly portal link: ${portalUrl}\n\nThis link expires in 1 hour.`,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, client_id: clientId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
