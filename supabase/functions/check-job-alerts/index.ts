import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function formatAuPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+61")) return cleaned;
  if (cleaned.startsWith("61") && cleaned.length >= 11) return "+" + cleaned;
  if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
  return "+61" + cleaned;
}

async function sendTwilioSms(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER")!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Twilio error:", JSON.stringify(data));
      return false;
    }
    return true;
  } catch (err) {
    console.error("SMS send error:", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminPhone = Deno.env.get("ADMIN_PHONE");
  const admin = createClient(supabaseUrl, serviceKey);

  const results: string[] = [];

  // ── CONDITION 1: No-show (20+ mins overdue, no check-in) ──
  try {
    // Get today's date in AEST (UTC+10)
    const nowUtc = new Date();
    const aestOffset = 10 * 60 * 60 * 1000;
    const nowAest = new Date(nowUtc.getTime() + aestOffset);
    const todayStr = nowAest.toISOString().slice(0, 10);

    // Current AEST time as HH:MM for comparison
    const nowHours = nowAest.getHours();
    const nowMins = nowAest.getMinutes();
    const totalNowMins = nowHours * 60 + nowMins;

    const { data: noShowJobs, error: nsErr } = await admin
      .from("jobs")
      .select("id, scheduled_time, cleaner_1_id, cleaner_2_id, property_id, properties(property_name, address, suburb)")
      .eq("status", "scheduled")
      .eq("scheduled_date", todayStr)
      .is("check_in_time", null)
      .eq("no_show_alert_sent", false)
      .not("scheduled_time", "is", null);

    if (nsErr) {
      console.error("No-show query error:", nsErr.message);
    }

    for (const job of noShowJobs ?? []) {
      try {
        // Parse scheduled_time (HH:MM or HH:MM:SS)
        const timeParts = (job.scheduled_time as string).split(":");
        const schedMins = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);

        // Only alert if 20+ minutes past scheduled time
        if (totalNowMins - schedMins < 20) continue;

        // Mark alert sent first to avoid duplicates
        await admin.from("jobs").update({ no_show_alert_sent: true }).eq("id", job.id);

        // Get cleaner name
        const cleanerId = job.cleaner_1_id;
        let cleanerName = "Unassigned cleaner";
        if (cleanerId) {
          const { data: profile } = await admin
            .from("profiles")
            .select("full_name")
            .eq("id", cleanerId)
            .maybeSingle();
          if (profile?.full_name) cleanerName = profile.full_name;
        }

        const prop = job.properties as any;
        const propName = prop?.property_name || "Unknown property";
        const propAddr = [prop?.address, prop?.suburb].filter(Boolean).join(", ") || propName;
        const timeStr = job.scheduled_time as string;
        const timeFormatted = timeStr.slice(0, 5);

        // Insert notification for admin
        // Find admin user IDs
        const { data: adminRoles } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        for (const ar of adminRoles ?? []) {
          await admin.from("notifications").insert({
            user_id: ar.user_id,
            title: "⚠️ No-show alert",
            message: `⚠️ No check-in: ${cleanerName} was due at ${propName} at ${timeFormatted}. 20 mins overdue.`,
            type: "no_show_alert",
            link: `/jobs/${job.id}`,
          });
        }

        // SMS to admin
        if (adminPhone) {
          await sendTwilioSms(
            formatAuPhone(adminPhone),
            `⚠️ BRIGHTLY ALERT: ${cleanerName} has not checked in for the ${timeFormatted} job at ${propAddr}. Please action immediately.`
          );
        }

        results.push(`no_show: job ${job.id}`);
      } catch (err) {
        console.error(`No-show processing error for job ${job.id}:`, err);
      }
    }
  } catch (err) {
    console.error("No-show block error:", err);
  }

  // ── CONDITION 2: Running late (checked in 15+ mins after scheduled time) ──
  try {
    const nowUtc = new Date();
    const aestOffset = 10 * 60 * 60 * 1000;
    const nowAest = new Date(nowUtc.getTime() + aestOffset);
    const todayStr = nowAest.toISOString().slice(0, 10);

    const { data: lateJobs, error: ltErr } = await admin
      .from("jobs")
      .select("id, scheduled_time, check_in_time, property_id, properties(property_name)")
      .eq("status", "in_progress")
      .eq("scheduled_date", todayStr)
      .eq("late_alert_sent", false)
      .not("check_in_time", "is", null)
      .not("scheduled_time", "is", null);

    if (ltErr) {
      console.error("Late query error:", ltErr.message);
    }

    for (const job of lateJobs ?? []) {
      try {
        // Compare check_in_time with scheduled_time
        const timeParts = (job.scheduled_time as string).split(":");
        const schedMins = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);

        const checkInDate = new Date(job.check_in_time as string);
        const checkInAest = new Date(checkInDate.getTime() + aestOffset);
        const checkInMins = checkInAest.getHours() * 60 + checkInAest.getMinutes();

        if (checkInMins - schedMins < 15) continue;

        // Mark sent
        await admin.from("jobs").update({ late_alert_sent: true }).eq("id", job.id);

        // Get client phone from client_properties
        const { data: cpRows } = await admin
          .from("client_properties")
          .select("client_id")
          .eq("property_id", job.property_id!)
          .limit(1);

        const clientId = cpRows?.[0]?.client_id;
        if (!clientId) continue;

        const { data: clientProfile } = await admin
          .from("profiles")
          .select("full_name, phone")
          .eq("id", clientId)
          .maybeSingle();

        if (!clientProfile?.phone) continue;

        const clientFirst = (clientProfile.full_name ?? "").split(" ")[0] || "there";

        await sendTwilioSms(
          formatAuPhone(clientProfile.phone),
          `Hi ${clientFirst}, just a heads up — your Brightly cleaner is running slightly behind schedule but has now arrived and is getting started. Thanks for your patience!`
        );

        results.push(`late_alert: job ${job.id}`);
      } catch (err) {
        console.error(`Late alert processing error for job ${job.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Late alert block error:", err);
  }

  return new Response(
    JSON.stringify({ ok: true, processed: results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
