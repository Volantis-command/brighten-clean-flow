import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatAuPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+61")) return cleaned;
  if (cleaned.startsWith("61") && cleaned.length >= 11) return "+" + cleaned;
  if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
  return "+61" + cleaned;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_id, property_name, property_address } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Find clients linked to this property's job
    const { data: job } = await admin.from("jobs").select("property_id").eq("id", job_id).single();
    if (!job) return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Get client links with guest_ready_sms enabled
    const { data: links } = await admin.from("client_properties").select("client_id, guest_ready_sms").eq("property_id", job.property_id).eq("guest_ready_sms", true);
    if (!links?.length) return new Response(JSON.stringify({ message: "No clients to notify" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const clientIds = links.map((l: any) => l.client_id);
    const { data: profiles } = await admin.from("profiles").select("id, full_name, phone").in("id", clientIds);

    const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
      console.error("Twilio credentials not configured");
      return new Response(JSON.stringify({ error: "SMS not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true });
    const results: any[] = [];

    for (const profile of (profiles || [])) {
      if (!profile.phone) continue;

      const firstName = profile.full_name?.split(" ")[0] || "there";
      const body = `Hi ${firstName}, your property at ${property_address || property_name} is guest-ready as of ${timeStr}. Cleaned by Brightly. View your report at your Brightly portal. — Brightly`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
      const resp = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: formatAuPhone(profile.phone), From: TWILIO_PHONE, Body: body }),
      });

      const data = await resp.json();
      results.push({ phone: profile.phone, success: resp.ok, sid: data.sid });
    }

    return new Response(JSON.stringify({ sent: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
