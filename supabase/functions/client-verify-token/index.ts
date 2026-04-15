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
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Look up token
    const { data: tokenRow, error } = await supabase
      .from("client_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error || !tokenRow) {
      return new Response(JSON.stringify({ error: "invalid" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenRow.used) {
      return new Response(JSON.stringify({ error: "used" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as used
    await supabase
      .from("client_tokens")
      .update({ used: true })
      .eq("id", tokenRow.id);

    // Find client info by email
    const email = tokenRow.email;

    // Check profiles with client role
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", email);

    let clientInfo: any = null;
    if (profiles) {
      for (const p of profiles) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", p.id)
          .eq("role", "client")
          .maybeSingle();
        if (roleData) {
          clientInfo = { id: p.id, name: p.full_name, email: p.email, type: "profile" };
          break;
        }
      }
    }

    // Fallback: check properties by billing_email
    if (!clientInfo) {
      const { data: props } = await supabase
        .from("properties")
        .select("id, client_name, billing_email")
        .ilike("billing_email", email)
        .limit(1);

      if (props && props.length > 0) {
        clientInfo = { id: props[0].id, name: props[0].client_name, email: props[0].billing_email, type: "property" };
      }
    }

    // Fallback: quote_requests
    if (!clientInfo) {
      const { data: qr } = await supabase
        .from("quote_requests")
        .select("id, first_name, last_name, email")
        .ilike("email", email)
        .limit(1);

      if (qr && qr.length > 0) {
        clientInfo = {
          id: qr[0].id,
          name: `${qr[0].first_name || ''} ${qr[0].last_name || ''}`.trim(),
          email: qr[0].email,
          type: "quote_request",
        };
      }
    }

    if (!clientInfo) {
      return new Response(JSON.stringify({ error: "no_client" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, client: clientInfo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
