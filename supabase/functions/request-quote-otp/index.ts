// ============================================================================
// REQUEST QUOTE OTP — verify a lead's phone before showing them a price
//
// Fake and competitor "leads" were coming through the instant quote (made-up
// names, junk numbers) to harvest pricing. The price is now gated behind a real
// SMS code, so only someone holding that handset can see it.
//
// This CANNOT reuse request-login-otp: that one deliberately refuses to text a
// number with no account, and leads by definition have no account.
//
// Codes are stored in the existing auth_otp_codes table with the phone
// namespaced as "quote:<e164>". That keeps lead codes and staff login codes
// from colliding for the same number without needing a schema change.
//
// SMS-PUMPING PROTECTION: an endpoint that texts arbitrary numbers is a fraud
// target — attackers loop it against premium-rate numbers and the account owner
// pays. Hence the per-phone and global hourly caps below.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_PER_PHONE_PER_HOUR = 3;
const MAX_GLOBAL_PER_HOUR = 60;

function normalizePhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (/^0\d{9,10}$/.test(cleaned)) return "+61" + cleaned.slice(1);
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length >= 10) return "+" + cleaned;
  return cleaned;
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const generateCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");

async function sendSms(to: string, body: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !fromNumber) throw new Error("Twilio not configured");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
    },
  );
  if (!res.ok) throw new Error(`Twilio: ${await res.text()}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { phone: rawPhone } = await req.json();
    const phone = normalizePhone(rawPhone || "");
    if (phone.length < 8) return json({ error: "Enter a valid mobile number" }, 400);

    // Australian mobiles only — the business is Gold Coast based, and this
    // blocks the overseas premium-rate numbers used in SMS-pumping fraud.
    if (!/^\+61[45]\d{8}$/.test(phone)) {
      return json({ error: "Enter a valid Australian mobile number" }, 400);
    }

    const key = `quote:${phone}`;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Cap per phone.
    const { count: phoneCount } = await supabase
      .from("auth_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("phone", key)
      .gte("created_at", hourAgo);
    if ((phoneCount ?? 0) >= MAX_PER_PHONE_PER_HOUR) {
      return json({ error: "Too many codes requested. Try again in an hour." }, 429);
    }

    // Global circuit breaker — caps the damage if someone scripts this.
    const { count: globalCount } = await supabase
      .from("auth_otp_codes")
      .select("id", { count: "exact", head: true })
      .like("phone", "quote:%")
      .gte("created_at", hourAgo);
    if ((globalCount ?? 0) >= MAX_GLOBAL_PER_HOUR) {
      return json({ error: "Too busy right now — please call 0418 878 707." }, 429);
    }

    const code = generateCode();
    const codeHash = await sha256Hex(code);

    // Last code wins.
    await supabase.from("auth_otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("phone", key).is("consumed_at", null);

    const { error: insErr } = await supabase.from("auth_otp_codes").insert({
      phone: key,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (insErr) throw insErr;

    await sendSms(phone, `${code} is your Brightly code. Enter it to see your instant quote.`);

    return json({ ok: true });
  } catch (err: any) {
    console.error("request-quote-otp:", err);
    return json({ error: "Could not send code. Please try again." }, 500);
  }
});
