// ============================================================================
// VERIFY QUOTE OTP — confirms the lead actually holds that phone
//
// Pairs with request-quote-otp. On success the caller may reveal the price and
// the lead is recorded as phone-verified, so the office knows it's a real
// person rather than a competitor fishing for pricing.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 5;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { phone: rawPhone, code } = await req.json();
    const phone = normalizePhone(rawPhone || "");
    if (!phone || !code) return json({ error: "Enter the code we sent you" }, 400);

    const key = `quote:${phone}`;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows } = await supabase
      .from("auth_otp_codes")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("phone", key)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const otp = (rows || [])[0];
    if (!otp) return json({ error: "That code has expired — request a new one." }, 400);

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return json({ error: "That code has expired — request a new one." }, 400);
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await supabase.from("auth_otp_codes")
        .update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
      return json({ error: "Too many wrong attempts — request a new code." }, 429);
    }

    if (otp.code_hash !== await sha256Hex(String(code).trim())) {
      await supabase.from("auth_otp_codes")
        .update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return json({ error: "That code isn't right — check and try again." }, 400);
    }

    await supabase.from("auth_otp_codes")
      .update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);

    return json({ verified: true, phone });
  } catch (err: any) {
    console.error("verify-quote-otp:", err);
    return json({ error: "Could not verify. Please try again." }, 500);
  }
});
