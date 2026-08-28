// Approve a client's booking request, or ask them to pick another time.
//
// Both actions text the client, because the worst version of this is BJ
// deciding and the customer never hearing. The message wording lives in
// message_templates so he can change it without a deploy.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizePhone = (raw: string) => {
  const c = (raw || "").replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(c)) return "+61" + c.slice(1);
  if (c.startsWith("+")) return c;
  return c.length >= 10 ? "+" + c : c;
};

async function sendSms(to: string, body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!sid || !token || !from) throw new Error("Twilio is not configured");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio: ${await res.text()}`);
}

const render = (body: string, vars: Record<string, string>) =>
  body.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? "")
      .replace(/[ \t]{2,}/g, " ").replace(/ ([,.!?])/g, "$1").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { job_id, action, approved_by } = await req.json();
    if (!job_id || !["approve", "request_change"].includes(action)) {
      return json({ error: "job_id and action (approve | request_change) are required" }, 400);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: job, error: jobErr } = await sb
      .from("jobs")
      .select("id, scheduled_date, scheduled_time, client_name, client_phone, approval_status, property_id")
      .eq("id", job_id).maybeSingle();
    if (jobErr || !job) return json({ error: "Job not found" }, 404);

    // Fall back to the property's phone if the job has none.
    let phone = normalizePhone(job.client_phone || "");
    if (!phone && job.property_id) {
      const { data: prop } = await sb.from("properties")
        .select("client_phone").eq("id", job.property_id).maybeSingle();
      phone = normalizePhone(prop?.client_phone || "");
    }

    const firstName = String(job.client_name || "there").split(" ")[0];
    const dateLabel = job.scheduled_date
      ? new Date(job.scheduled_date + "T00:00:00").toLocaleDateString("en-AU",
          { weekday: "long", day: "numeric", month: "long" })
      : "your booked day";
    const timeLabel = job.scheduled_time ? String(job.scheduled_time).slice(0, 5) : "";

    const tplKey = action === "approve" ? "booking_approved" : "booking_change_requested";
    const { data: tpl } = await sb.from("message_templates").select("body").eq("key", tplKey).maybeSingle();

    const fallback = action === "approve"
      ? "Good news {first_name}, your clean is confirmed for {date} at {time}."
      : "Hi {first_name}, sorry, we cannot make {date} at {time}. Pick another time here: {booking_link}";

    const message = render(tpl?.body || fallback, {
      first_name: firstName,
      date: dateLabel,
      time: timeLabel,
      booking_link: "https://app.brightly.cleaning/instant-quote",
    });

    if (action === "approve") {
      const { error } = await sb.from("jobs").update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: approved_by || null,
      }).eq("id", job_id);
      if (error) return json({ error: `Could not approve: ${error.message}` }, 500);
    } else {
      // Release the slot. The job stays so the history is intact, but a
      // cancelled job is invisible to the availability engine, so the time
      // becomes bookable again the moment BJ asks them to move.
      const { error } = await sb.from("jobs").update({
        approval_status: "change_requested",
        status: "cancelled",
      }).eq("id", job_id);
      if (error) return json({ error: `Could not release the slot: ${error.message}` }, 500);
    }

    // The database is already correct. If the text fails, say so plainly rather
    // than rolling back a decision BJ has made.
    let texted = false, smsError: string | null = null;
    if (phone) {
      try { await sendSms(phone, message); texted = true; }
      catch (e: any) { smsError = e?.message || "SMS failed"; console.error("booking-approval SMS:", smsError); }
    } else {
      smsError = "No mobile number on this job";
    }

    return json({ ok: true, action, texted, sms_error: smsError, message });
  } catch (err: any) {
    console.error("booking-approval:", err);
    return json({ error: err?.message || "Something went wrong" }, 500);
  }
});
