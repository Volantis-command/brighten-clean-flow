/**
 * linen-portal-data
 *
 * Serves data for the linen company portal.  No Supabase auth session —
 * instead, the caller passes their phone number (stored in localStorage
 * after OTP verification) and we validate it against linen_settings.phone.
 *
 * Actions:
 *   get_deliveries   — upcoming + recent deliveries (next 30 days)
 *   update_delivery  — mark a delivery as delivered (or revert to pending)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (/^0\d{9,10}$/.test(cleaned)) return "+61" + cleaned.slice(1);
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length >= 10) return "+" + cleaned;
  return cleaned;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, phone: rawPhone, delivery_id, status, notes } = body;

    if (!action || !rawPhone) {
      return new Response(JSON.stringify({ error: "action and phone required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(rawPhone);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Authenticate: phone must match linen_settings.phone ──────────────────
    const { data: settings } = await supabase
      .from("linen_settings")
      .select("phone, company_name")
      .limit(1)
      .single();

    const registeredPhone = normalizePhone(settings?.phone || "");
    if (!registeredPhone || registeredPhone !== phone) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── get_deliveries ────────────────────────────────────────────────────────
    if (action === "get_deliveries") {
      // Return deliveries for jobs from today onwards (plus any pending ones)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];

      const { data: deliveries, error } = await supabase
        .from("linen_deliveries")
        .select(`
          id, status, deliver_by, delivered_at, linen_requirements, notes, sms_sent_at, created_at,
          jobs:job_id (
            id, scheduled_date, scheduled_time,
            properties:property_id ( id, address )
          )
        `)
        .or(`status.eq.pending,delivered_at.gte.${todayStr}`)
        .order("deliver_by", { ascending: true });

      if (error) throw error;

      // Filter: only include deliveries whose job date is today or in future
      // (plus pending ones from the past that haven't been actioned)
      const filtered = (deliveries || []).filter((d: any) => {
        const jobDate = d.jobs?.scheduled_date;
        if (!jobDate) return true;
        return jobDate >= todayStr || d.status === "pending";
      });

      return new Response(JSON.stringify({
        deliveries: filtered,
        company_name: settings?.company_name || "Linen Company",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── update_delivery ───────────────────────────────────────────────────────
    if (action === "update_delivery") {
      if (!delivery_id || !status) {
        return new Response(JSON.stringify({ error: "delivery_id and status required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!["pending", "delivered"].includes(status)) {
        return new Response(JSON.stringify({ error: "invalid status" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const update: Record<string, any> = {
        status,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      };
      if (status === "delivered") {
        update.delivered_at = new Date().toISOString();
      } else {
        update.delivered_at = null;
      }

      const { error } = await supabase
        .from("linen_deliveries")
        .update(update)
        .eq("id", delivery_id);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── get_week_schedule ─────────────────────────────────────────────────────
    if (action === "get_week_schedule") {
      // Return all jobs Mon–Sun of next calendar week
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dow = today.getDay(); // 0=Sun
      const daysToMonday = dow === 0 ? 1 : 8 - dow;
      const monday = new Date(today);
      monday.setDate(today.getDate() + daysToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fromStr = monday.toISOString().split("T")[0];
      const toStr = sunday.toISOString().split("T")[0];

      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select(`
          id, scheduled_date, scheduled_time, status,
          properties:property_id ( id, address, property_name, linen_requirements, bed_config, bathrooms )
        `)
        .gte("scheduled_date", fromStr)
        .lte("scheduled_date", toStr)
        .neq("status", "cancelled")
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true, nullsFirst: false });

      if (jobsErr) throw jobsErr;

      // Only jobs for properties that have linen or bed config
      const linenJobs = (jobs || []).filter((j: any) => {
        const p = j.properties;
        return p?.linen_requirements || p?.bed_config;
      });

      return new Response(JSON.stringify({
        jobs: linenJobs,
        week_start: fromStr,
        week_end: toStr,
        company_name: settings?.company_name || "Linen Company",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("linen-portal-data error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
