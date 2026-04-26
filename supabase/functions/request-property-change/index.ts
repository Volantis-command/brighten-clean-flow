import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Allow-list of properties columns clients can request changes to.
// Anything not in here is rejected — admins still own everything else
// (billing_email, status, hostaway_listing_id, pricing, …).
const ALLOWED_FIELDS = new Set([
  "access_method",
  "access_code",
  "alarm_code",
  "garage_code",
  "parking_notes",
  "special_instructions",
  "preferences_notes",
]);

// Friendly labels for the admin notification body. Keys must match
// ALLOWED_FIELDS; missing entries fall back to the raw column name.
const FIELD_LABELS: Record<string, string> = {
  access_method: "Access method",
  access_code: "Access code",
  alarm_code: "Alarm code",
  garage_code: "Garage code",
  parking_notes: "Parking notes",
  special_instructions: "Special instructions",
  preferences_notes: "Preferences",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "request-property-change" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, property_id, field_name, new_value } = await req.json();
    if (!token || !property_id || !field_name) {
      return new Response(JSON.stringify({ error: "token, property_id, field_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_FIELDS.has(field_name)) {
      return new Response(JSON.stringify({ error: `field "${field_name}" cannot be edited from the portal` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Resolve the portal token to a client_id, then verify the
    //    requested property belongs to that client.
    const { data: tokenRow } = await supabase
      .from("client_properties")
      .select("client_id")
      .eq("portal_token", token)
      .eq("portal_active", true)
      .maybeSingle();
    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "invalid or inactive portal link" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Snapshot current value so the admin sees what would change.
    const { data: prop } = await supabase
      .from("properties")
      .select(`property_name, ${field_name}`)
      .eq("id", property_id)
      .maybeSingle();
    const currentValue = prop ? (prop as any)[field_name] : null;
    const propertyName = prop?.property_name || "Property";

    // 3. Insert the pending change.
    const { data: inserted, error: insertErr } = await supabase
      .from("property_change_requests")
      .insert({
        property_id,
        client_id: tokenRow.client_id,
        field_name,
        current_value: currentValue == null ? null : String(currentValue),
        new_value: new_value == null ? "" : String(new_value),
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // 4. Notify admins. event_type maps to the seeded tier in alert_tiers.
    try {
      const label = FIELD_LABELS[field_name] || field_name;
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const rows = (admins || []).map((a: any) => ({
        user_id: a.user_id,
        type: "property_change_requested",
        event_type: "property_change_requested",
        tier: "important",
        message: `${label} change requested for ${propertyName}`,
        metadata: {
          property_id,
          property_name: propertyName,
          field_name,
          current_value: currentValue,
          new_value,
          request_id: inserted?.id,
        },
        actor_id: tokenRow.client_id,
        target_role: "admin",
      }));
      if (rows.length > 0) {
        await supabase.from("notifications").insert(rows);
      }
    } catch (_) {
      // Non-fatal — request still saved.
    }

    return new Response(JSON.stringify({ ok: true, request_id: inserted?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
