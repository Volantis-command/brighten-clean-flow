import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Same allow-list as request-property-change. Defence-in-depth: the
// request side already filtered, but a malicious DB row (someone who
// bypassed the request side) shouldn't be able to mutate arbitrary
// columns when an admin clicks Approve.
const ALLOWED_FIELDS = new Set([
  "access_method",
  "access_code",
  "alarm_code",
  "garage_code",
  "parking_notes",
  "special_instructions",
  "preferences_notes",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "auth required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use the caller's JWT to figure out who they are; bail if not admin.
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { request_id, decision, rejection_reason } = await req.json();
    if (!request_id || !["approved", "rejected"].includes(decision)) {
      return new Response(JSON.stringify({ error: "request_id + decision in (approved, rejected) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: changeReq, error: fetchErr } = await admin
      .from("property_change_requests")
      .select("*")
      .eq("id", request_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!changeReq) {
      return new Response(JSON.stringify({ error: "request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (changeReq.status !== "pending") {
      return new Response(JSON.stringify({ error: `already ${changeReq.status}` }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (decision === "approved" && !ALLOWED_FIELDS.has(changeReq.field_name)) {
      return new Response(JSON.stringify({ error: "field not in allow-list (will not apply)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Mark the request decided.
    const { error: updateErr } = await admin
      .from("property_change_requests")
      .update({
        status: decision,
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        rejection_reason: decision === "rejected" ? (rejection_reason || null) : null,
      })
      .eq("id", request_id);
    if (updateErr) throw updateErr;

    // 2. If approved, write the new value to the properties table.
    if (decision === "approved") {
      const { error: applyErr } = await admin
        .from("properties")
        .update({ [changeReq.field_name]: changeReq.new_value })
        .eq("id", changeReq.property_id);
      if (applyErr) throw applyErr;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
