/**
 * send-linen-sms
 *
 * Called by the DB trigger (pg_net) after a new job is inserted for a
 * property that has linen_requirements set.
 *
 * Looks up the job + property + linen_settings, sends an SMS to the
 * linen company, then updates linen_deliveries.sms_sent_at.
 *
 * Also callable manually (e.g. admin "resend SMS" button) with { job_id }.
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

async function sendSms(to: string, body: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio not configured");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twilio error: ${txt}`);
  }
}

function formatDateTime(ts: string | null): string {
  if (!ts) return "TBC";
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-AU", {
      timeZone: "Australia/Brisbane",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return ts;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load delivery + job + property
    const { data: delivery, error: delErr } = await supabase
      .from("linen_deliveries")
      .select(`
        id, deliver_by, linen_requirements,
        jobs:job_id (
          scheduled_date, scheduled_time,
          properties:property_id ( address, linen_requirements )
        )
      `)
      .eq("job_id", job_id)
      .single();

    if (delErr || !delivery) {
      // Delivery row might not exist yet if the trigger fired before insert committed.
      // Try fetching directly from jobs + properties.
      console.error("Delivery not found for job", job_id, delErr?.message);
      return new Response(JSON.stringify({ error: "delivery not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load linen settings (company phone)
    const { data: settings } = await supabase
      .from("linen_settings")
      .select("phone, company_name")
      .limit(1)
      .single();

    if (!settings?.phone) {
      return new Response(JSON.stringify({ error: "no linen phone configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(settings.phone);
    const job = (delivery as any).jobs;
    const property = job?.properties;
    const address = property?.address || "Unknown property";
    const linenReq = delivery.linen_requirements || property?.linen_requirements || "";
    const cleanDate = job?.scheduled_date || "";
    const cleanTime = job?.scheduled_time || "";

    // Format clean datetime for the SMS
    const cleanTs = cleanDate
      ? formatDateTime(`${cleanDate}T${cleanTime || "08:00:00"}+10:00`)
      : "TBC";
    const deliverTs = delivery.deliver_by
      ? formatDateTime(delivery.deliver_by)
      : "12 hours before clean";

    const message =
      `Brightly Linen Request\n` +
      `Property: ${address}\n` +
      `Clean: ${cleanTs}\n` +
      `Deliver linen by: ${deliverTs}\n` +
      `Requirements:\n${linenReq}\n` +
      `Log in to check off deliveries: app.brightly.cleaning/linen-portal`;

    await sendSms(phone, message);

    // Mark SMS sent
    await supabase
      .from("linen_deliveries")
      .update({ sms_sent_at: new Date().toISOString() })
      .eq("job_id", job_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-linen-sms error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
