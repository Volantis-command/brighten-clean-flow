// The one place the office sends a text from inside the app, to anybody.
//
// This replaces send-lead-sms, which could only text a lead. The Messages tab
// on a client had its own reply box that inserted a row into client_messages,
// said "Reply sent", and sent nothing at all. Every reply typed into it since
// the tab was built went nowhere.
//
// Give it a lead_id, a profile_id, or a bare number. It resolves the mobile,
// sends, refuses to claim success when Twilio says no, and writes the message
// to sms_conversations so it appears in that person's thread immediately
// rather than waiting for the five-minute Twilio sync.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function toE164(raw: string): string {
  const c = (raw || "").replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(c)) return "+61" + c.slice(1);
  if (c.startsWith("+")) return c;
  if (/^61\d{9}$/.test(c)) return "+" + c;
  if (/^4\d{8}$/.test(c)) return "+61" + c;
  return c;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { lead_id, profile_id, to: rawTo, body } = await req.json();
    const text = String(body || "").trim();
    if (!text) return json({ error: "A message is required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // This can text any number in the country on the company's Twilio account,
    // so it is office staff only. A signed-in cleaner must not reach it.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await sb.auth.getUser(jwt);
    const caller = userData?.user;
    if (!caller) return json({ error: "Not signed in" }, 401);

    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", caller.id);
    const isStaff = (roles || []).some((r: any) => ["admin", "head_cleaner"].includes(r.role));
    if (!isStaff) return json({ error: "Only admins can send texts from here" }, 403);

    // Work out who we are texting, and keep hold of the record so the message
    // can be filed against them.
    let to = "";
    let leadId: string | null = null;
    let profileId: string | null = null;
    let leadStage: string | null = null;

    if (lead_id) {
      const { data: lead } = await sb
        .from("quote_requests").select("id, phone, stage").eq("id", lead_id).maybeSingle();
      if (!lead) return json({ error: "Lead not found" }, 404);
      to = toE164(lead.phone || "");
      leadId = lead.id;
      leadStage = lead.stage ?? null;
      if (!to) return json({ error: "That lead has no mobile number" }, 400);
    } else if (profile_id) {
      const { data: p } = await sb
        .from("profiles").select("id, phone").eq("id", profile_id).maybeSingle();
      if (!p) return json({ error: "Client not found" }, 404);
      to = toE164(p.phone || "");
      profileId = p.id;
      if (!to) return json({ error: "That client has no mobile number on file" }, 400);
    } else if (rawTo) {
      to = toE164(String(rawTo));
      if (!to) return json({ error: "That is not a valid mobile number" }, 400);
    } else {
      return json({ error: "Give me a lead_id, a profile_id or a number" }, 400);
    }

    // Fill in the other side of the identity where we can, so the thread stays
    // whole when the same person is both a lead and a client.
    if (!profileId) {
      const { data: p } = await sb
        .from("profiles").select("id, phone").in("phone", [to, "0" + to.slice(3)]).limit(1);
      if (p?.length) profileId = p[0].id;
    }
    if (!leadId) {
      const { data: l } = await sb
        .from("quote_requests").select("id").in("phone", [to, "0" + to.slice(3)])
        .order("created_at", { ascending: false }).limit(1);
      if (l?.length) leadId = l[0].id;
    }

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!sid || !token || !from) return json({ error: "Twilio is not configured" }, 500);

    // StatusCallback matters. Twilio accepting the request only means QUEUED.
    // It calls back as the message reaches sent, delivered, undelivered or
    // failed, and twilio-status records what actually happened.
    const params = new URLSearchParams({ To: to, From: from, Body: text });
    params.set("StatusCallback", `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-status`);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const tw = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      // Twilio's own words rather than a generic failure. 21211 is a bad
      // number, 21610 means they have replied STOP, and so on.
      const msg = tw?.message || JSON.stringify(tw) || "unknown";
      return json({ error: `Twilio rejected it: ${msg}`, code: tw?.code ?? null }, 502);
    }

    // The thread, keyed by phone. This is what both the client Messages tab and
    // the lead chat box read, and what Jess reads before she replies.
    await sb.from("sms_conversations").insert({
      phone: to,
      direction: "out",
      body: text,
      sender_type: "admin",
      profile_id: profileId,
      lead_id: leadId,
      twilio_sid: tw?.sid ?? null,
      delivery_status: tw?.status ?? "queued",
    } as any);

    // A lead also gets the pipeline treatment: timeline entry, red flag
    // cleared, and moved out of New now that someone has actually spoken.
    if (leadId) {
      const now = new Date().toISOString();
      await sb.from("lead_events").insert({
        lead_id: leadId, kind: "sms_out", body: text, actor: "admin",
        twilio_sid: tw?.sid ?? null,
        delivery_status: tw?.status ?? "queued",
      } as any);
      await sb.from("quote_requests").update({
        needs_reply_at: null,
        last_contacted_at: now,
        ...(leadStage === "new" ? { stage: "contacted", stage_changed_at: now } : {}),
      } as any).eq("id", leadId);
    }

    return json({ sent: true, to, sid: tw?.sid ?? null, status: tw?.status ?? "queued" });
  } catch (err: any) {
    console.error("send-sms:", err);
    return json({ error: err?.message || "Could not send" }, 500);
  }
});
