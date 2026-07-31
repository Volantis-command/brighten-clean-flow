// ============================================================================
// JESS — first touch
//
// Speed to lead. The moment someone verifies their mobile and sees their price,
// Jess texts them. Not the office — the CUSTOMER. They're still looking at the
// quote when it lands, which is the whole point: response inside a minute is
// worth multiples of response in an hour.
//
// Jess writes like a person on the team, because that converts. Two hard rules
// she never breaks:
//   * She only ever repeats the price the quote engine produced, plus the
//     configured discount. She never invents or negotiates a number.
//   * She only offers a day that is genuinely light in the schedule, and she
//     offers to HOLD it, not to confirm it. Brendan confirms.
//
// Everything is configurable from app_settings so the offer can change without
// a deploy: jess_enabled, jess_discount, jess_name.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULTS = { enabled: true, discount: 20, name: "Jess" };

function normalizePhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (/^0\d{9,10}$/.test(cleaned)) return "+61" + cleaned.slice(1);
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length >= 10) return "+" + cleaned;
  return cleaned;
}

async function sendSms(to: string, body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!sid || !token || !from) throw new Error("Twilio not configured");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    },
  );
  if (!res.ok) throw new Error(`Twilio: ${await res.text()}`);
}

/**
 * Find a genuinely quiet weekday in the next fortnight so Jess never offers a
 * slot that isn't there. Returns null if every day is busy — she then asks what
 * day suits instead of naming one.
 */
async function suggestDay(supabase: any): Promise<string | null> {
  const from = new Date();
  const to = new Date(Date.now() + 14 * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: jobs } = await supabase
    .from("jobs")
    .select("scheduled_date")
    .gte("scheduled_date", iso(from))
    .lte("scheduled_date", iso(to))
    .not("status", "in", '("cancelled")');

  const counts = new Map<string, number>();
  for (const j of (jobs || [])) {
    counts.set(j.scheduled_date, (counts.get(j.scheduled_date) || 0) + 1);
  }

  // Start 2 days out — enough notice to actually staff it.
  for (let i = 2; i <= 14; i++) {
    const d = new Date(Date.now() + i * 864e5);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;           // weekdays only
    if ((counts.get(iso(d)) || 0) >= 4) continue;   // that day's already full
    return d.toLocaleDateString("en-AU", { weekday: "long" });
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const {
      lead_id, first_name, phone: rawPhone, quoted, clean_type, property_size,
      dry_run,   // compose and return the message WITHOUT sending — for previewing
    } = await req.json();

    const phone = normalizePhone(rawPhone || "");
    if (!phone || !quoted) return json({ error: "phone and quoted required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Config (falls back to sensible defaults) ──
    const { data: settings } = await supabase
      .from("app_settings").select("key, value")
      .in("key", ["jess_enabled", "jess_discount", "jess_name"]);
    const cfg = { ...DEFAULTS };
    for (const s of (settings || [])) {
      if (s.key === "jess_enabled") cfg.enabled = String(s.value) !== "false";
      if (s.key === "jess_discount") cfg.discount = Number(s.value) || 0;
      if (s.key === "jess_name") cfg.name = String(s.value || DEFAULTS.name);
    }
    if (!cfg.enabled) return json({ skipped: "jess disabled" });

    // Don't text the same lead twice.
    if (lead_id) {
      const { data: lead } = await supabase
        .from("quote_requests").select("form_data").eq("id", lead_id).maybeSingle();
      if ((lead?.form_data as any)?.jess_first_touch_at) {
        return json({ skipped: "already contacted" });
      }
    }

    const name = (first_name || "there").split(" ")[0];
    const price = Math.round(Number(quoted));
    const after = Math.max(0, price - cfg.discount);
    const day = await suggestDay(supabase);
    const what = property_size ? `${property_size} ${clean_type || "clean"}` : (clean_type || "clean");

    // Warm, specific, ONE clear action. The discount and price are stated
    // exactly as recorded on the lead — Jess never improvises a number.
    const msg =
      `Hi ${name}, ${cfg.name} here from Brightly Cleaning 👋 Thanks for grabbing a price — your ${what} came to $${price}.\n\n` +
      (cfg.discount > 0
        ? `I'd love to get you in for a first clean, so I'll take $${cfg.discount} off — $${after} to see how we work.\n\n`
        : `I'd love to get you booked in for your first clean.\n\n`) +
      (day
        ? `We've got ${day} morning free — want me to hold it for you? Reply YES and I'll lock it in.`
        : `What day suits you this week? Reply and I'll see what I can do.`);

    // Preview mode: show exactly what would be sent, send nothing, record nothing.
    if (dry_run) return json({ preview: msg, discount: cfg.discount, day, to: phone });

    await sendSms(phone, msg);

    // Record it on the lead so the office can see exactly what was promised —
    // and so the discount actually follows through to the booking.
    if (lead_id) {
      const { data: lead } = await supabase
        .from("quote_requests").select("form_data").eq("id", lead_id).maybeSingle();
      await supabase.from("quote_requests").update({
        form_data: {
          ...((lead?.form_data as any) || {}),
          jess_first_touch_at: new Date().toISOString(),
          jess_discount_offered: cfg.discount,
          jess_price_after_discount: after,
          jess_day_offered: day,
          jess_message: msg,
        },
      } as any).eq("id", lead_id);
    }

    return json({ sent: true, discount: cfg.discount, day });
  } catch (err: any) {
    console.error("jess-first-touch:", err);
    return json({ error: err.message || "Could not send" }, 500);
  }
});
