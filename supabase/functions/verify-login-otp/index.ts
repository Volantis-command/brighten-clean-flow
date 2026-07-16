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
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "verify-login-otp" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the latest unconsumed code for this phone.
    const { data: rows } = await supabase
      .from("auth_otp_codes")
      .select("id, code_hash, expires_at, attempts")
      .eq("phone", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const otp = (rows || [])[0];

    if (!otp) {
      return new Response(JSON.stringify({ error: "no active code — request a new one" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "code expired — request a new one" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      // Burn it so brute force is bounded.
      await supabase.from("auth_otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
      return new Response(JSON.stringify({ error: "too many attempts — request a new code" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (otp.code_hash !== codeHash) {
      await supabase.from("auth_otp_codes").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return new Response(JSON.stringify({ error: "incorrect code" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark the code consumed before we mint the session — even if the
    // session step fails, the code is single-use.
    await supabase.from("auth_otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);

    // Find the auth user. Profile.phone may have spaces or other
    // formatting; auth.users.phone was backfilled to the digits-only
    // form by the migration, but old records and edge cases mean we
    // fall back to a profile lookup too.
    const phoneDigits = phone.replace(/\D/g, "");
    const last9 = phoneDigits.slice(-9);

    // Look up ALL profiles matching the phone (a user may have a test
    // cleaner account + an admin account with the same phone — pick the
    // highest-privilege one so people don't get logged in as a side
    // account).
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .or(`phone.eq.${phone},phone.ilike.%${last9}`);
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ error: "no account found for this phone — contact admin" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve roles for each candidate, then pick the most privileged.
    // Order: admin > head_cleaner > cleaner > client > (no role).
    const ROLE_RANK: Record<string, number> = {
      admin: 4, head_cleaner: 3, cleaner: 2, client: 1,
    };
    const ids = profiles.map((p: any) => p.id);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    const roleByUser: Record<string, string> = {};
    (roles || []).forEach((r: any) => {
      const cur = roleByUser[r.user_id];
      if (!cur || (ROLE_RANK[r.role] || 0) > (ROLE_RANK[cur] || 0)) {
        roleByUser[r.user_id] = r.role;
      }
    });
    const sorted = [...profiles].sort((a: any, b: any) => {
      const ra = ROLE_RANK[roleByUser[a.id]] || 0;
      const rb = ROLE_RANK[roleByUser[b.id]] || 0;
      return rb - ra;
    });
    const profile = sorted[0];

    // Get the auth user's email so we can mint a magic link.
    const { data: authUser, error: getUserErr } = await supabase.auth.admin.getUserById(profile.id);
    if (getUserErr || !authUser?.user?.email) {
      return new Response(JSON.stringify({ error: "account is missing email — contact admin to fix" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a one-shot magic link. The frontend extracts the token_hash
    // from this URL and calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
    // to establish a real Supabase auth session — JWTs, refresh tokens,
    // RLS, ProtectedRoute all work normally from there.
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.user.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("generateLink failed:", linkErr);
      return new Response(JSON.stringify({ error: "could not establish session — try again" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        token_hash: linkData.properties.hashed_token,
        // Supabase verifyOtp expects type='email' for magic links
        // generated via generateLink({type:'magiclink'}).
        verify_type: "email",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("verify-login-otp error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
