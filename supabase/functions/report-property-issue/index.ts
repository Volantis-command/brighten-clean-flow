import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROOMS = new Set([
  "Kitchen", "Bathroom", "Bedroom", "Lounge", "Balcony",
  "Entry", "Laundry", "Outdoor", "Other",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "report-property-issue" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, property_id, room, description, photo_url } = await req.json();
    if (!token || !property_id || !description?.trim()) {
      return new Response(JSON.stringify({ error: "token, property_id, description required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeRoom = room && VALID_ROOMS.has(room) ? room : "Other";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Token → client → ownership.
    const { data: tokenRow } = await supabase
      .from("client_properties")
      .select("client_id")
      .eq("portal_token", token)
      .eq("portal_active", true)
      .maybeSingle();
    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "invalid or inactive portal link" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownership } = await supabase
      .from("client_properties")
      .select("id")
      .eq("client_id", tokenRow.client_id)
      .eq("property_id", property_id)
      .eq("portal_active", true)
      .maybeSingle();
    if (!ownership) {
      return new Response(JSON.stringify({ error: "you do not own this property" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prop } = await supabase
      .from("properties").select("property_name").eq("id", property_id).maybeSingle();
    const propertyName = prop?.property_name || "Property";

    // Insert the issue.
    const { data: inserted, error: insErr } = await supabase
      .from("property_issues")
      .insert({
        property_id,
        room: safeRoom,
        description: description.trim().slice(0, 2000),
        photo_url: photo_url || null,
        reported_by: tokenRow.client_id,
        status: "open",
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // Fan notifications to admins.
    try {
      const { data: admins } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      const rows = (admins || []).map((a: any) => ({
        user_id: a.user_id,
        type: "issue_reported",
        event_type: "issue_reported",
        tier: "important",
        message: `Issue reported at ${propertyName} (${safeRoom})`,
        metadata: {
          property_id,
          property_name: propertyName,
          room: safeRoom,
          description: description.trim().slice(0, 280),
          issue_id: inserted?.id,
        },
        actor_id: tokenRow.client_id,
        target_role: "admin",
      }));
      if (rows.length > 0) await supabase.from("notifications").insert(rows);
    } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ ok: true, issue_id: inserted?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
