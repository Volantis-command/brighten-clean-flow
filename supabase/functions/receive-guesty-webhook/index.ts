import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();

    // Test action from settings page
    if (body.action === "test") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check auto-create setting
    const { data: autoSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "guesty_auto_create")
      .maybeSingle();

    if (autoSetting?.value !== "true") {
      return new Response(JSON.stringify({ skipped: "auto-create disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract Guesty event data
    const event = body.event || body;
    const listingId = event.listing_id || event.listingId || event.listing?.id;
    const checkoutDate = event.check_out || event.checkout_date || event.checkOut;
    const checkinDate = event.check_in_next || event.next_check_in || event.nextCheckIn;
    const guestName = event.guest_name || event.guest?.fullName || "Guest";

    if (!listingId || !checkoutDate) {
      return new Response(
        JSON.stringify({ error: "Missing listing_id or checkout date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Match Guesty listing ID to Brightly property
    const { data: property } = await supabase
      .from("properties")
      .select("id, property_name, default_cleaner_id, price_turnover, assigned_cleaner_ids, checkout_time, checkin_time")
      .eq("guesty_listing_id", listingId)
      .maybeSingle();

    // Get admin users for notifications
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (adminRoles || []).map((r: any) => r.user_id);

    if (!property) {
      // Unknown listing — alert admins
      const alerts = adminIds.map((uid: string) => ({
        user_id: uid,
        title: "Unknown Guesty Listing",
        message: `Guesty checkout received for unknown listing ${listingId} — match it in Properties.`,
        type: "guesty_alert",
        link: "/properties",
      }));
      if (alerts.length) await supabase.from("notifications").insert(alerts);

      return new Response(JSON.stringify({ error: "No matching property" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine urgency
    const checkoutDt = new Date(checkoutDate);
    const checkinDt = checkinDate ? new Date(checkinDate) : null;
    const turnaroundMinutes = checkinDt
      ? Math.round((checkinDt.getTime() - checkoutDt.getTime()) / 60000)
      : null;
    const isUrgent = checkinDt
      ? (checkinDt.getTime() - checkoutDt.getTime()) < 6 * 60 * 60 * 1000
      : false;

    const scheduledDate = checkoutDt.toISOString().split("T")[0];
    const scheduledTime = property.checkout_time || "10:00";

    // Get primary cleaner
    const assignedIds: string[] = Array.isArray(property.assigned_cleaner_ids) ? property.assigned_cleaner_ids : [];
    const primaryCleaner = assignedIds[0] || property.default_cleaner_id || null;

    // Create job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        property_id: property.id,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        cleaner_1_id: primaryCleaner,
        status: "scheduled",
        price_ex_gst: property.price_turnover,
        price_inc_gst: property.price_turnover ? Number(property.price_turnover) * 1.1 : null,
        guest_checkout_time: checkoutDate,
        guest_checkin_time: checkinDate || null,
        turnaround_minutes: turnaroundMinutes,
        is_urgent: isUrgent,
        source: "guesty",
        notes: `Guest: ${guestName}`,
      })
      .select("id")
      .single();

    if (jobError) throw jobError;

    // Send urgent SMS if needed
    if (isUrgent && primaryCleaner) {
      const { data: cleanerProfile } = await supabase
        .from("profiles")
        .select("phone, full_name")
        .eq("id", primaryCleaner)
        .maybeSingle();

      if (cleanerProfile?.phone) {
        const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

        if (twilioSid && twilioToken && twilioPhone) {
          const appUrl = supabaseUrl.replace(".supabase.co", "");
          const msg = `URGENT: Turnover needed today — ${property.property_name}. Checkout ${scheduledTime}, check-in ${property.checkin_time || 'TBC'}. Open your app to view details.`;

          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: cleanerProfile.phone,
              From: twilioPhone,
              Body: msg,
            }),
          });
        }
      }
    }

    // Admin notification
    const turnaroundText = turnaroundMinutes
      ? `${Math.floor(turnaroundMinutes / 60)}h ${turnaroundMinutes % 60}m turnaround`
      : "";
    const notifications = adminIds.map((uid: string) => ({
      user_id: uid,
      title: isUrgent ? "🔴 URGENT Guesty Turnover" : "Guesty Turnover Created",
      message: `New turnover job: ${property.property_name} on ${scheduledDate}${turnaroundText ? ` — ${turnaroundText}` : ""}`,
      type: "guesty_job",
      link: `/jobs/${job.id}`,
    }));
    if (notifications.length) await supabase.from("notifications").insert(notifications);

    return new Response(JSON.stringify({ ok: true, job_id: job.id, is_urgent: isUrgent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Guesty webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
