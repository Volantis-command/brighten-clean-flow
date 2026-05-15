/**
 * verify-linen-otp
 *
 * Verifies the 6-digit code sent to the linen company's phone.
 * On success returns { verified: true, phone } which the frontend
 * stores in localStorage as the linen portal session.
 */

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

  try {
    const { phone: rawPhone, code } = await req.json();
    if (!rawPhone || !code) {
      return new Response(JSON.stringify({ error: "phone and code required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(rawPhone);
    const codeHash = await sha256Hex(String(code).trim());

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the latest unconsumed code for this phone
    const { data: rows } = await supabase
      .from("auth_otp_codes")
      .select("id, code_hash, expires_at, attempts")
      .eq("phone", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const otp = (rows || [])[0];

    if (!otp) {
      return new Response(JSON.stringify({ error: "No active code — request a new one" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Code expired — request a new one" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      await supabase
        .from("auth_otp_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", otp.id);
      return new Response(JSON.stringify({ error: "Too many attempts — request a new code" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (otp.code_hash !== codeHash) {
      await supabase
        .from("auth_otp_codes")
        .update({ attempts: otp.attempts + 1 })
        .eq("id", otp.id);
      return new Response(JSON.stringify({ error: "Incorrect code" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Consume the code
    await supabase
      .from("auth_otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);

    return new Response(JSON.stringify({ verified: true, phone }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("verify-linen-otp error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
