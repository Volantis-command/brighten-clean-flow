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
    const reservationId = event.reservation_id || event.reservationId || event.id || "";

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
      if (adminIds.length) {
        const tierRes = await supabase.from("alert_tiers").select("tier, enabled").eq("event_type", "booking_suggestion_pending").maybeSingle();
        const tier = (tierRes.data as any)?.tier || "important";
        if ((tierRes.data as any)?.enabled !== false) {
          await supabase.from("notifications").insert(adminIds.map((uid: string) => ({
            user_id: uid,
            title: "Unknown Guesty Listing",
            message: `Guesty checkout received for unknown listing ${listingId} — match it in Settings > Integrations.`,
            type: "guesty_alert",
            tier,
            event_type: "booking_suggestion_pending",
            link: "/settings",
          })));
        }
      }

      return new Response(JSON.stringify({ error: "No matching property" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create booking suggestion instead of direct job
    const checkoutDt = new Date(checkoutDate);
    const checkinDt = checkinDate ? new Date(checkinDate) : null;
    const scheduledDate = checkoutDt.toISOString().split("T")[0];
    const scheduledTime = property.checkout_time || "10:00";

    const { data: suggestion, error: sugErr } = await supabase
      .from("booking_suggestions")
      .insert({
        property_id: property.id,
        source: "guesty",
        external_ref: reservationId,
        guest_name: guestName,
        checkin_date: checkinDt ? checkinDt.toISOString().split("T")[0] : null,
        checkout_date: scheduledDate,
        suggested_clean_date: scheduledDate,
        suggested_clean_time: scheduledTime,
        status: "pending",
      })
      .select("id")
      .single();

    if (sugErr) throw sugErr;

    // Determine urgency for notification title
    const turnaroundMinutes = checkinDt
      ? Math.round((checkinDt.getTime() - checkoutDt.getTime()) / 60000)
      : null;
    const isUrgent = checkinDt
      ? (checkinDt.getTime() - checkoutDt.getTime()) < 6 * 60 * 60 * 1000
      : false;

    // Admin notification via tiered alerts
    const turnaroundText = turnaroundMinutes
      ? `${Math.floor(turnaroundMinutes / 60)}h ${turnaroundMinutes % 60}m turnaround`
      : "";

    if (adminIds.length) {
      const tierRes = await supabase.from("alert_tiers").select("tier, enabled").eq("event_type", "booking_suggestion_pending").maybeSingle();
      const tier = (tierRes.data as any)?.tier || "important";
      if ((tierRes.data as any)?.enabled !== false) {
        await supabase.from("notifications").insert(adminIds.map((uid: string) => ({
          user_id: uid,
          title: isUrgent ? "🔴 URGENT Guesty Booking" : "New Guesty Booking Suggestion",
          message: `${property.property_name} on ${scheduledDate}${turnaroundText ? ` — ${turnaroundText}` : ""} — needs approval`,
          type: "booking_suggestion_pending",
          tier,
          event_type: "booking_suggestion_pending",
          link: "/bookings/suggestions",
          metadata: { suggestion_id: suggestion.id, is_urgent: isUrgent },
        })));
      }
    }

    return new Response(JSON.stringify({ ok: true, suggestion_id: suggestion.id, is_urgent: isUrgent }), {
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
