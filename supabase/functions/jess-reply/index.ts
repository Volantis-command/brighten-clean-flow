// ============================================================================
// JESS — conversational SMS replies
//
// Replaces "we received your message but couldn't match it to a pending action.
// Please reply YES or NO", which is what anyone got if they wrote a normal
// sentence. Jess now works out WHO is texting, pulls their actual context, and
// answers like a person.
//
// Identity is resolved from the phone number, in this order:
//   staff/client profile  →  recent lead (quote_requests)  →  unknown
//
// HARD RULES (enforced in the prompt AND relied on by the office):
//   * Never invent, discount or negotiate a price. Only ever repeat the number
//     already recorded on their quote.
//   * Never confirm a booking. She can offer to hold a time; Brendan confirms.
//   * Never claim to be a human if asked directly.
//   * Anything about complaints, refunds, damage or price changes goes straight
//     to Brendan instead of being answered.
//   * No long dashes. Brendan's rule, and it reads more human anyway.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-haiku-4-5-20251001";
const HISTORY_LIMIT = 12;

function normalizePhone(raw: string): string {
  if (!raw) return "";
  const c = raw.replace(/[^\d+]/g, "");
  if (/^0\d{9,10}$/.test(c)) return "+61" + c.slice(1);
  if (c.startsWith("+")) return c;
  if (c.length >= 10) return "+" + c;
  return c;
}

/** Long dashes read like a machine wrote them. Strip them everywhere. */
function humanise(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ").replace(/\s+,/g, ",").trim();
}

async function sendSms(to: string, body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!sid || !token || !from) throw new Error("Twilio not configured");
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

/** Best-effort logging. Never let a missing table break a reply. */
async function log(sb: any, row: Record<string, unknown>) {
  try { await sb.from("sms_conversations").insert(row); } catch { /* table may not exist yet */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { phone: rawPhone, body: message, dry_run } = await req.json();
    const phone = normalizePhone(rawPhone || "");
    if (!phone || !message) return json({ error: "phone and body required" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. WHO IS THIS? ──────────────────────────────────────────────────────
    const digits = phone.replace(/\D/g, "");
    const last9 = digits.slice(-9);

    let who: any = { type: "unknown", name: "there" };

    const { data: profiles } = await sb
      .from("profiles").select("id, full_name, email, phone")
      .or(`phone.eq.${phone},phone.ilike.%${last9}`);

    if (profiles?.length) {
      const p = profiles[0];
      const { data: roles } = await sb
        .from("user_roles").select("role").eq("user_id", p.id);
      const roleNames = (roles || []).map((r: any) => r.role);
      const isStaff = roleNames.some((r: string) => ["admin", "head_cleaner", "cleaner"].includes(r));
      who = {
        type: isStaff ? "staff" : "client",
        role: roleNames[0] || "client",
        id: p.id,
        name: (p.full_name || "there").split(" ")[0],
      };
    } else {
      const { data: leads } = await sb
        .from("quote_requests")
        .select("id, first_name, last_name, clean_type, total_inc_gst, bedrooms, bathrooms, address, status, stage, form_data")
        .or(`phone.eq.${phone},phone.ilike.%${last9}`)
        .order("created_at", { ascending: false }).limit(1);
      if (leads?.length) {
        const l = leads[0];
        who = { type: "lead", id: l.id, name: (l.first_name || "there").split(" ")[0], lead: l };

        // They wrote back, so this lead now owes a human answer. Recorded here,
        // at the moment we identify them, so the "needs reply" queue is correct
        // even if the AI reply below fails or Anthropic is down. Someone
        // reaching out must never fall silently into a gap.
        const inAt = new Date().toISOString();
        const keepStage = l.stage === "booked" || l.stage === "won" || l.stage === "lost";
        await sb.from("quote_requests").update({
          stage: keepStage ? l.stage : "in_conversation",
          stage_changed_at: keepStage ? undefined : inAt,
          needs_reply_at: inAt,
        } as any).eq("id", l.id);

        await sb.from("lead_events").insert({
          lead_id: l.id,
          kind: "sms_in",
          body: message || null,
          from_stage: l.stage ?? null,
          to_stage: keepStage ? l.stage : "in_conversation",
          actor: "customer",
        } as any);
      }
    }

    // ── 2. THEIR ACTUAL CONTEXT ──────────────────────────────────────────────
    let context = "";
    if (who.type === "lead" && who.lead) {
      const l = who.lead;
      const fd = l.form_data || {};
      context =
        `They are a NEW LEAD, not yet a customer.\n` +
        `Quote on file: $${Math.round(Number(l.total_inc_gst || 0))} for a ${l.bedrooms || "?"} bed ${l.bathrooms || "?"} bath ${l.clean_type || "clean"}.\n` +
        (fd.jess_discount_offered
          ? `A $${fd.jess_discount_offered} first-clean discount was already offered, so their price is $${fd.jess_price_after_discount}.\n`
          : "") +
        (fd.jess_day_offered ? `We offered to hold ${fd.jess_day_offered} morning.\n` : "") +
        (l.address ? `Address given: ${l.address}\n` : `We do not have their address yet.\n`) +
        `Lead status: ${l.status}`;
    } else if (who.type === "client") {
      const { data: cps } = await sb
        .from("client_properties").select("property_id").eq("client_id", who.id);
      const ids = (cps || []).map((c: any) => c.property_id);
      let jobs: any[] = [];
      if (ids.length) {
        const { data: j } = await sb
          .from("jobs").select("scheduled_date, scheduled_time, status, properties(property_name)")
          .in("property_id", ids)
          .gte("scheduled_date", new Date().toISOString().slice(0, 10))
          .order("scheduled_date").limit(5);
        jobs = j || [];
      }
      context =
        `They are an EXISTING CLIENT with ${ids.length} property/properties.\n` +
        (jobs.length
          ? `Upcoming cleans:\n` + jobs.map((j: any) =>
              `  ${j.scheduled_date}${j.scheduled_time ? " " + String(j.scheduled_time).slice(0, 5) : ""} at ${j.properties?.property_name || "their property"} (${j.status})`).join("\n")
          : `No upcoming cleans booked.`);
    } else if (who.type === "staff") {
      const { data: jobs } = await sb
        .from("jobs").select("scheduled_date, scheduled_time, status, properties(property_name)")
        .or(`cleaner_1_id.eq.${who.id},cleaner_2_id.eq.${who.id}`)
        .gte("scheduled_date", new Date().toISOString().slice(0, 10))
        .order("scheduled_date").limit(5);
      context =
        `They are BRIGHTLY STAFF (${who.role}). Be brief and practical, like a colleague.\n` +
        ((jobs || []).length
          ? `Their next cleans:\n` + (jobs || []).map((j: any) =>
              `  ${j.scheduled_date}${j.scheduled_time ? " " + String(j.scheduled_time).slice(0, 5) : ""} at ${j.properties?.property_name || "a property"} (${j.status})`).join("\n")
          : `No upcoming cleans assigned to them.`);
    } else {
      context = `We have no record of this number. Be friendly, find out what they need, and offer to have Brendan call.`;
    }

    // ── 3. CONVERSATION SO FAR ───────────────────────────────────────────────
    let history: any[] = [];
    try {
      const { data: h } = await sb
        .from("sms_conversations").select("direction, body")
        .eq("phone", phone).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
      history = (h || []).reverse();
    } catch { /* table may not exist yet */ }

    // ── 4. ASK CLAUDE ────────────────────────────────────────────────────────
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const system =
`You are Jess, who works at Brightly Cleaning on the Gold Coast, Australia. You reply to customers by SMS.

HOW YOU WRITE
- Like a real person texting. Short. Warm. Australian. Use contractions.
- Two or three sentences at most. This is SMS, not email.
- NEVER use long dashes. Use commas or full stops.
- No corporate phrases. Never say "reply YES". Ask a normal question instead.
- Don't sign off with your name every time. You already said who you are.

WHAT YOU MUST NEVER DO
- Never invent, change, discount or negotiate a price. Only ever repeat the exact figure on their quote below. If they push for a better price, say you'll check with Brendan.
- Never confirm a booking as locked in. You can offer to HOLD a time. Brendan confirms it.
- Never promise a specific cleaner, or a time you have not been told is free.
- Never claim to be a human if they ask directly. Say you're Brightly's assistant and offer to get Brendan to call. Be relaxed about it, not apologetic.
- Never give an opinion on a complaint, refund, damage or anything legal. Hand it to Brendan.

WHEN TO HAND OVER
If they want a different price, are unhappy, mention damage or a refund, or you genuinely don't know, do NOT guess. Reply warmly saying you'll get Brendan onto it, and set needs_human to true.

ABOUT BRIGHTLY
Airbnb and short stay turnovers, plus standard home cleans, on the Gold Coast. Turnovers include linen and consumables. Photo report after every clean. Phone 0418 878 707.

WHO YOU ARE TEXTING
${who.name} (${who.type}).
${context}

Reply with JSON only: {"reply":"your SMS text","needs_human":true|false,"reason":"short note for Brendan if needs_human"}`;

    const messages = [
      ...history.map((h: any) => ({
        role: h.direction === "in" ? "user" : "assistant",
        content: h.body,
      })),
      { role: "user", content: String(message) },
    ];

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages }),
    });
    if (!aiRes.ok) throw new Error(`Anthropic: ${await aiRes.text()}`);
    const ai = await aiRes.json();
    const raw = ai?.content?.[0]?.text ?? "";

    let reply = "", needsHuman = false, reason = "";
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      reply = String(parsed.reply || "").trim();
      needsHuman = !!parsed.needs_human;
      reason = String(parsed.reason || "");
    } catch {
      reply = raw.trim();
    }
    if (!reply) {
      reply = "Thanks for that, let me check with Brendan and come straight back to you.";
      needsHuman = true;
      reason = "Jess could not compose a reply";
    }
    reply = humanise(reply);

    if (dry_run) return json({ who: who.type, name: who.name, reply, needs_human: needsHuman, reason });

    // ── 5. REPLY, LOG, ESCALATE ──────────────────────────────────────────────
    await log(sb, {
      phone, direction: "in", body: String(message),
      sender_type: who.type, profile_id: who.type === "lead" ? null : (who.id ?? null),
      lead_id: who.type === "lead" ? who.id : null,
    });

    await sendSms(phone, reply);

    await log(sb, {
      phone, direction: "out", body: reply, sender_type: "jess",
      profile_id: who.type === "lead" ? null : (who.id ?? null),
      lead_id: who.type === "lead" ? who.id : null,
      escalated: needsHuman,
    });

    // Anything she wouldn't answer goes to Brendan with the full picture.
    if (needsHuman) {
      const { data: admins } = await sb
        .from("user_roles").select("user_id").eq("role", "admin");
      for (const a of (admins || [])) {
        await sb.from("notifications").insert({
          user_id: (a as any).user_id,
          type: "sms",
          title: `💬 ${who.name} needs you`,
          message: `${who.name} (${phone}) asked: "${String(message).slice(0, 140)}". ${reason || "Jess handed it over."}`,
          link: who.type === "lead" ? `/clients?leadPhone=${encodeURIComponent(phone)}` : "/clients",
        });
        const { data: prof } = await sb
          .from("profiles").select("phone").eq("id", (a as any).user_id).maybeSingle();
        if (prof?.phone) {
          try {
            await sendSms(normalizePhone(prof.phone),
              `Jess needs you. ${who.name} (${phone}) asked:\n"${String(message).slice(0, 140)}"\n\nReply to them on ${phone}`);
          } catch { /* don't fail the customer reply over an admin alert */ }
        }
      }
    }

    return json({ sent: true, who: who.type, reply, needs_human: needsHuman });
  } catch (err: any) {
    console.error("jess-reply:", err);
    return json({ error: err.message || "failed" }, 500);
  }
});
