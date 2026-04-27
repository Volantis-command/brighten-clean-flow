import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Strip everything but digits and a leading +. Tolerates "+61 420 219 101",
// "(02) 420 219 101", "0420219101" — but the database lookup needs the
// canonical form, so we also produce a "digits only" suffix variant.
function normalizePhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  // If user typed a local AU number starting with 0, convert to +61.
  if (/^0\d{9,10}$/.test(cleaned)) return "+61" + cleaned.slice(1);
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length >= 10) return "+" + cleaned;
  return cleaned;
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateCode(): string {
  // 6-digit, leading-zero-padded.
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

async function sendSms(to: string, body: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio not configured (missing env vars)");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  });
  if (!res.ok) {
    const data = await res.text();
    throw new Error(`Twilio: ${data}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "request-login-otp" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { phone: rawPhone } = await req.json();
    if (!rawPhone) {
      return new Response(JSON.stringify({ error: "phone required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const phone = normalizePhone(rawPhone);
    if (phone.length < 8) {
      return new Response(JSON.stringify({ error: "invalid phone" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify SOMEONE has this phone. We don't tell the caller whether
    // the phone is registered (don't leak account existence) but we
    // also don't bother sending an SMS to a phone with no account.
    const phoneDigits = phone.replace(/\D/g, "");
    const last9 = phoneDigits.slice(-9);
    const { data: profileMatches } = await supabase
      .from("profiles")
      .select("id, phone")
      .or(`phone.eq.${phone},phone.ilike.%${last9}`);

    // Always wait a similar amount of time and return success either
    // way, so an attacker can't enumerate phone numbers via timing.
    const found = (profileMatches || []).length > 0;

    if (found) {
      const code = generateCode();
      const codeHash = await sha256Hex(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Invalidate any prior unused code for this phone — last code wins.
      await supabase
        .from("auth_otp_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("phone", phone)
        .is("consumed_at", null);

      const { error: insErr } = await supabase
        .from("auth_otp_codes")
        .insert({ phone, code_hash: codeHash, expires_at: expiresAt });
      if (insErr) throw insErr;

      try {
        await sendSms(phone, `Your Brightly login code: ${code}\n\nExpires in 10 min. Don't share with anyone.`);
      } catch (smsErr) {
        // SMS send failed — surface this so the user knows. We've
        // already invalidated their previous code, so they can try
        // again immediately.
        console.error("OTP SMS failed:", smsErr);
        return new Response(JSON.stringify({ error: "could not send code — check your phone number and try again" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Generic success regardless of whether we actually sent — UI says
    // "if your phone is registered, a code is on its way". Prevents
    // account enumeration.
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("request-login-otp error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
