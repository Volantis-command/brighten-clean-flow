import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results: string[] = [];

  try {
    // STAGE 1: 30 days silent → followup_pending
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: silentQuotes } = await supabase
      .from("quote_requests")
      .select("id, first_name, last_name, address, total_inc_gst")
      .in("status", ["sent", "form_submitted"])
      .lt("created_at", thirtyDaysAgo)
      .is("followup_sent_at", null);

    for (const q of silentQuotes || []) {
      await supabase.from("quote_requests").update({
        status: "followup_pending",
        last_status_change: new Date().toISOString(),
      }).eq("id", q.id);

      // Create alert
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const tierRes = await supabase.from("alert_tiers").select("tier, enabled").eq("event_type", "quote_followup_pending").maybeSingle();
      const tier = (tierRes.data as any)?.tier || "important";
      if ((tierRes.data as any)?.enabled !== false && admins?.length) {
        await supabase.from("notifications").insert(admins.map((a: any) => ({
          user_id: a.user_id,
          title: "Quote followup needed",
          message: `${q.first_name} ${q.last_name || ""} — ${q.address || "No address"} — 30+ days silent`,
          type: "quote_followup_pending",
          tier,
          event_type: "quote_followup_pending",
          link: "/quotes/followups-pending",
        })));
      }
      results.push(`followup_pending: ${q.id}`);
    }

    // STAGE 2: 7 day grace after followup → expired
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiredQuotes } = await supabase
      .from("quote_requests")
      .select("id, first_name, last_name, address")
      .eq("status", "followup_sent")
      .lt("followup_sent_at", sevenDaysAgo);

    for (const q of expiredQuotes || []) {
      await supabase.from("quote_requests").update({
        status: "expired",
        last_status_change: new Date().toISOString(),
      }).eq("id", q.id);

      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const tierRes = await supabase.from("alert_tiers").select("tier, enabled").eq("event_type", "quote_auto_expired").maybeSingle();
      const tier = (tierRes.data as any)?.tier || "critical";
      if ((tierRes.data as any)?.enabled !== false && admins?.length) {
        await supabase.from("notifications").insert(admins.map((a: any) => ({
          user_id: a.user_id,
          title: "Quote auto-expired",
          message: `${q.first_name} ${q.last_name || ""} — ${q.address || ""} — no response after followup`,
          type: "quote_auto_expired",
          tier,
          event_type: "quote_auto_expired",
          link: "/quoting",
        })));
      }
      results.push(`expired: ${q.id}`);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Quote lifecycle error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
