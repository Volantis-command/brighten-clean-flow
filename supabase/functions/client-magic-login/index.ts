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
    const body = await req.json();
    const emailInput = body.email?.trim();
    const phoneInput = body.phone?.trim();

    if (!emailInput && !phoneInput) {
      return new Response(JSON.stringify({ error: "Email or phone is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let name: string | null = null;
    let phone: string | null = null;
    let email: string | null = emailInput || null;
    let clientId: string | null = null;

    // Pre-fetch all client user_ids — staff are NEVER eligible for client portal login
    const { data: clientRoleRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "client");
    const clientUserIds = new Set((clientRoleRows || []).map((r: any) => r.user_id));

    // Pre-fetch staff user_ids so we can explicitly exclude them from any fallback match
    const { data: staffRoleRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "cleaner", "head_cleaner"]);
    const staffUserIds = new Set((staffRoleRows || []).map((r: any) => r.user_id));

    if (phoneInput) {
      // Phone-based lookup: normalize digits
      const phoneDigits = phoneInput.replace(/[\s()\-+]/g, '');
      const phoneSuffix = phoneDigits.length > 9 ? phoneDigits.slice(-9) : phoneDigits;

      // ONLY look at profiles that have the client role — staff profiles are excluded entirely
      let clientProfile: any = null;
      if (clientUserIds.size > 0) {
        const { data: profileMatch } = await supabase
          .from("profiles")
          .select("id, full_name, phone, email")
          .in("id", Array.from(clientUserIds))
          .not("phone", "is", null);

        if (profileMatch) {
          for (const p of profileMatch) {
            const pDigits = (p.phone || '').replace(/[\s()\-+]/g, '');
            if (pDigits.endsWith(phoneSuffix)) {
              clientProfile = p;
              break;
            }
          }
        }
      }

      if (clientProfile) {
        name = clientProfile.full_name;
        phone = clientProfile.phone;
        email = clientProfile.email;
        clientId = clientProfile.id;
      }

      // Fallback: properties.client_phone — but skip any property whose billing_email/client matches a staff profile
      if (!clientId) {
        const { data: props } = await supabase
          .from("properties")
          .select("id, client_name, client_phone, billing_email")
          .not("client_phone", "is", null);

        if (props) {
          for (const p of props) {
            const pDigits = (p.client_phone || '').replace(/[\s()\-+]/g, '');
            if (!pDigits.endsWith(phoneSuffix)) continue;

            // Verify this property is linked to a client (not a staff member) via client_properties
            const { data: link } = await supabase
              .from("client_properties")
              .select("client_id")
              .eq("property_id", p.id)
              .maybeSingle();

            // If linked to a staff user_id, skip
            if (link?.client_id && staffUserIds.has(link.client_id)) continue;

            name = p.client_name;
            phone = p.client_phone;
            email = p.billing_email;
            clientId = link?.client_id || p.id;
            break;
          }
        }
      }

      // Fallback: quote_requests.phone (leads have no auth user_id, safe to use)
      if (!clientId) {
        const { data: qr } = await supabase
          .from("quote_requests")
          .select("id, first_name, last_name, phone, email")
          .not("phone", "is", null);

        if (qr) {
          for (const q of qr) {
            const qDigits = (q.phone || '').replace(/[\s()\-+]/g, '');
            if (qDigits.endsWith(phoneSuffix)) {
              name = `${q.first_name || ''} ${q.last_name || ''}`.trim();
              phone = q.phone;
              email = q.email;
              clientId = q.id;
              break;
            }
          }
        }
      }

      // If we still don't have a phone to send to, use the input
      if (!phone) phone = phoneInput;
    } else {
      // Email-based lookup (existing logic)
      const { data: props } = await supabase
        .from("properties")
        .select("id, client_name, client_phone, billing_email")
        .ilike("billing_email", emailInput!);

      const { data: profileMatch } = await supabase
        .from("profiles")
        .select("id, full_name, phone, email")
        .ilike("email", emailInput!);

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

      const { data: quoteMatch } = await supabase
        .from("quote_requests")
        .select("id, first_name, last_name, phone, email")
        .ilike("email", emailInput!)
        .limit(1);

      name = clientProfile?.full_name
        || (props && props.length > 0 ? props[0].client_name : null)
        || (quoteMatch && quoteMatch.length > 0 ? `${quoteMatch[0].first_name || ''} ${quoteMatch[0].last_name || ''}`.trim() : null);

      phone = clientProfile?.phone
        || (props && props.length > 0 ? props[0].client_phone : null)
        || (quoteMatch && quoteMatch.length > 0 ? quoteMatch[0].phone : null);

      clientId = clientProfile?.id
        || (props && props.length > 0 ? props[0].id : null)
        || (quoteMatch && quoteMatch.length > 0 ? quoteMatch[0].id : null);
    }

    if (!clientId || !phone) {
      return new Response(
        JSON.stringify({ error: "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const tokenEmail = email || `phone:${phone}`;

    await supabase.from("client_tokens").insert({
      email: tokenEmail.toLowerCase(),
      token,
      expires_at: expiresAt,
      used: false,
    });

    // Get app URL
    const { data: urlSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "app_url")
      .maybeSingle();

    const appUrl = urlSetting?.value || "https://app.brightly.cleaning";
    const portalUrl = `${appUrl}/client-portal/verify?token=${token}`;
    const firstName = name?.split(" ")[0] || "there";

    // Send SMS via Twilio
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
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
