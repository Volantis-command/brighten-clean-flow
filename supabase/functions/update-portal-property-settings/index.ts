import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allow-list of properties columns clients can self-serve update from
// the portal (no admin approval needed). Distinct from passport
// changes (which require admin sign-off) — these are operational
// settings the host owns: turnover automation, notification prefs.
const ALLOWED_FIELDS = new Set([
  "auto_confirm_turnovers",
  "auto_confirm_min_hours",
  "auto_confirm_max_per_day",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "update-portal-property-settings" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, property_id, updates } = await req.json();
    if (!token || !property_id || !updates || typeof updates !== "object") {
      return new Response(JSON.stringify({ error: "token, property_id, updates required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter to allow-list — defence in depth.
    const safeUpdates: Record<string, any> = {};
    for (const k of Object.keys(updates)) {
      if (ALLOWED_FIELDS.has(k)) safeUpdates[k] = updates[k];
    }
    if (Object.keys(safeUpdates).length === 0) {
      return new Response(JSON.stringify({ error: "no allowed fields in updates" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokenRow } = await supabase
      .from("client_properties").select("client_id")
      .eq("portal_token", token).eq("portal_active", true).maybeSingle();
    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "invalid or inactive portal link" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownership } = await supabase
      .from("client_properties").select("id")
      .eq("client_id", tokenRow.client_id).eq("property_id", property_id).eq("portal_active", true)
      .maybeSingle();
    if (!ownership) {
      return new Response(JSON.stringify({ error: "you do not own this property" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("properties").update(safeUpdates).eq("id", property_id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, applied: safeUpdates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
