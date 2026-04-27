import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ACTIONS = new Set(["pause", "cancel", "skip_next", "reschedule"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "request-schedule-change" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, property_id, action, note, job_id, new_date, new_time } = await req.json();
    if (!token || !property_id || !action || !VALID_ACTIONS.has(action)) {
      return new Response(JSON.stringify({ error: "token, property_id, action ('pause' | 'cancel' | 'skip_next' | 'reschedule') required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "reschedule" && (!job_id || !new_date)) {
      return new Response(JSON.stringify({ error: "reschedule requires job_id and new_date" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .from("client_properties").select("id")
      .eq("client_id", tokenRow.client_id).eq("property_id", property_id).eq("portal_active", true)
      .maybeSingle();
    if (!ownership) {
      return new Response(JSON.stringify({ error: "you do not own this property" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prop } = await supabase
      .from("properties").select("property_name").eq("id", property_id).maybeSingle();
    const propertyName = prop?.property_name || "Property";

    // Notify admins. We don't auto-mutate job_series — admin needs to
    // confirm cancellation context (refund? final clean? new schedule?)
    // and the existing Schedule UI is the right place to apply changes.
    const actionLabels: Record<string, string> = {
      pause: "wants to pause their recurring schedule",
      cancel: "wants to cancel their recurring cleans",
      skip_next: "wants to skip their next clean",
      reschedule: `wants to reschedule a clean to ${new_date}${new_time ? ` ${new_time}` : ""}`,
    };
    const tierByAction: Record<string, string> = {
      cancel: "critical",
      pause: "important",
      skip_next: "important",
      reschedule: "important",
    };

    try {
      const { data: admins } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      const rows = (admins || []).map((a: any) => ({
        user_id: a.user_id,
        type: "schedule_change_requested",
        event_type: "schedule_change_requested",
        tier: tierByAction[action] || "important",
        message: `${propertyName} client ${actionLabels[action]}`,
        metadata: {
          property_id,
          property_name: propertyName,
          action,
          note: note || null,
          client_id: tokenRow.client_id,
          job_id: job_id || null,
          new_date: new_date || null,
          new_time: new_time || null,
        },
        actor_id: tokenRow.client_id,
        target_role: "admin",
      }));
      if (rows.length > 0) await supabase.from("notifications").insert(rows);
    } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
