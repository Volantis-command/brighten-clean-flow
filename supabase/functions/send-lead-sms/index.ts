// Send a text to a lead from inside the app, and record it.
//
// Before this, replying to a lead meant picking up your own phone, and the
// conversation existed nowhere the office could read it. This sends the
// message, writes it to the lead's timeline, stamps last_contacted_at and
// clears the needs-reply flag, so answering someone actually takes them out of
// the red queue.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(raw: string): string {
  const c = (raw || "").replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(c)) return "+61" + c.slice(1);
  if (c.startsWith("+")) return c;
  if (c.length >= 10) return "+" + c;
  return c;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { lead_id, body } = await req.json();
    if (!lead_id || !String(body || "").trim()) return json({ error: "lead_id and body are required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lead, error: leadErr } = await sb
      .from("quote_requests").select("id, phone, first_name, stage").eq("id", lead_id).maybeSingle();
    if (leadErr || !lead) return json({ error: "Lead not found" }, 404);

    const to = normalizePhone(lead.phone || "");
    if (!to) return json({ error: "That lead has no mobile number" }, 400);

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!sid || !token || !from) return json({ error: "Twilio is not configured" }, 500);

    // StatusCallback is the important part. Twilio answering this request only
    // means QUEUED, never delivered. It will call us back as the message moves
    // to sent, delivered, undelivered or failed, and twilio-status records it.
    const params = new URLSearchParams({ To: to, From: from, Body: String(body) });
    params.set("StatusCallback", `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-status`);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const twilioBody = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      // Twilio's own words, not a generic failure. Error 21211 is a bad number,
      // 21608 an unverified number on a trial account, and so on.
      const msg = twilioBody?.message || JSON.stringify(twilioBody) || "unknown";
      return json({ error: `Twilio rejected it: ${msg}`, code: twilioBody?.code ?? null }, 502);
    }

    const now = new Date().toISOString();
    await sb.from("lead_events").insert({
      lead_id, kind: "sms_out", body: String(body), actor: "admin",
      twilio_sid: twilioBody?.sid ?? null,
      delivery_status: twilioBody?.status ?? "queued",
    } as any);

    // Answering them clears the red flag. If they were only "contacted", a real
    // conversation has now started.
    await sb.from("quote_requests").update({
      needs_reply_at: null,
      last_contacted_at: now,
      ...(lead.stage === "new" ? { stage: "contacted", stage_changed_at: now } : {}),
    } as any).eq("id", lead_id);

    return json({ sent: true, to, sid: twilioBody?.sid ?? null, status: twilioBody?.status ?? "queued" });
  } catch (err: any) {
    console.error("send-lead-sms:", err);
    return json({ error: err?.message || "Could not send" }, 500);
  }
});
