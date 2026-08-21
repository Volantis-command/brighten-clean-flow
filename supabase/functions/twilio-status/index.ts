// Twilio calls this as a message moves through its lifecycle, so the app can
// tell the difference between "we handed it to Twilio" and "it reached their
// phone". Without it, a text that bounced at the carrier still showed as sent.
//
// Public by design: Twilio cannot present a Supabase JWT. Safe because the only
// thing it can do is set a delivery status on a message we already sent,
// matched on Twilio's own SID.

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    // Twilio posts form-encoded, not JSON.
    const form = new URLSearchParams(await req.text());
    const sid = form.get("MessageSid") || form.get("SmsSid");
    const status = form.get("MessageStatus") || form.get("SmsStatus");
    const errorCode = form.get("ErrorCode");

    if (sid && status) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("lead_events")
        .update({ delivery_status: status, error_code: errorCode || null } as any)
        .eq("twilio_sid", sid);
      console.log(`twilio-status: ${sid} -> ${status}${errorCode ? ` (error ${errorCode})` : ""}`);
    }

    // Twilio wants a 200 and does not read the body.
    return new Response("", { status: 200 });
  } catch (err) {
    console.error("twilio-status:", err);
    return new Response("", { status: 200 });
  }
});
