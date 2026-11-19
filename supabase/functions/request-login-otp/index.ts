import { createClient } from "npm:@supabase/supabase-js@2";
import { findProfilesByPhone, normalizePhone } from "../_shared/phone-lookup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


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

    // Verify SOMEONE has this phone.
    //
    // This comparison has to be formatting-insensitive. A number stored
    // as "+61 499 432 309" matched neither of the old filters, so the
    // lookup missed, no SMS was sent, and the response below still said
    // {ok:true} — a cleaner asking for a code and never getting one,
    // with nothing logged anywhere.
    const profileMatches = await findProfilesByPhone(supabase, phone);

    const found = profileMatches.length > 0;

    // A number we do not hold gets told so, plainly.
    //
    // This used to answer {ok:true} either way, to stop an attacker
    // learning which numbers have accounts. The cost of that was paid by
    // real people: the screen said "Code sent, check your phone", no SMS
    // ever came, and there was nothing to tell them why. It happened to
    // Lucy in September and to a client on 18 Nov, who reported it as the
    // app "not letting her put her number in" — because from her side,
    // typing the number and tapping the button simply did nothing.
    //
    // Enumeration is a poor trade here. Someone who guesses a mobile
    // learns only that it belongs to a Brightly client or cleaner, which
    // gets them nothing: the code still goes to the real handset. Against
    // that, every mistyped or out-of-date number used to become a support
    // call. Say the useful thing.
    if (!found) {
      return new Response(
        JSON.stringify({
          error: "We don't have that number on file. Check it's the mobile Brightly texts you on, or call 0418 878 707.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    {
      const code = generateCode();
      const codeHash = await sha256Hex(code);
      // An hour, not ten minutes.
      //
      // The window length is not what protects this code. MAX_ATTEMPTS in
      // verify-login-otp caps it at 5 guesses at a 6-digit number, the code
      // is single-use, and asking for a new one invalidates the old one. A
      // longer window costs nothing against that.
      //
      // What ten minutes did cost was real logins: a client reads the text,
      // puts the phone down, comes back to the app and the code is dead,
      // with no clue why. That reads as "the app logged me out again".
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

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
        await sendSms(phone, `Your Brightly login code: ${code}\n\nExpires in 1 hour. Don't share with anyone.`);
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
