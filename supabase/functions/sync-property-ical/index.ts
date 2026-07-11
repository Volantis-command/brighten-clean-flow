import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseICalEvents(icalText: string): Array<{ uid: string; summary: string; dtstart: string; dtend: string }> {
  const events: Array<{ uid: string; summary: string; dtstart: string; dtend: string }> = [];
  const blocks = icalText.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const uid = block.match(/UID:(.+)/)?.[1]?.trim() || "";
    const summary = block.match(/SUMMARY:(.+)/)?.[1]?.trim() || "";
    const dtstart = block.match(/DTSTART[^:]*:(\d{8})/)?.[1] || "";
    const dtend = block.match(/DTEND[^:]*:(\d{8})/)?.[1] || "";
    if (uid && dtend) {
      events.push({ uid, summary, dtstart, dtend });
    }
  }
  return events;
}

function icalDateToISO(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const results: string[] = [];

  try {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, property_name, ical_url, ical_source, checkout_time")
      .not("ical_url", "is", null);

    for (const prop of properties || []) {
      try {
        const res = await fetch(prop.ical_url);
        if (!res.ok) { results.push(`${prop.id}: fetch failed ${res.status}`); continue; }
        const text = await res.text();
        const events = parseICalEvents(text);

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const cutoffStr = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10); // 60-day horizon

        const source = prop.ical_source ? `${prop.ical_source}_ical` : "manual_ical";
        const feedUids = new Set<string>();

        for (const ev of events) {
          if (!ev.dtend) continue;

          // Skip Airbnb/host "blocked" or "not available" calendar entries —
          // those are owner holds, not guest stays, and must NOT create cleans
          // (this was a source of phantom cleans on days with no checkout).
          const summary = (ev.summary || "").toLowerCase();
          if (/not available|unavailable|blocked/.test(summary)) continue;

          const checkoutDate = icalDateToISO(ev.dtend);
          // Compare by DATE STRING, not timestamp. The old `checkoutDt < now`
          // compared midnight-UTC against the current time, which silently
          // dropped every same-day checkout. Include today → 60-day horizon.
          if (checkoutDate < todayStr || checkoutDate > cutoffStr) continue;

          const checkinDate = ev.dtstart ? icalDateToISO(ev.dtstart) : null;
          feedUids.add(ev.uid);

          const { data: existingRows } = await supabase
            .from("booking_suggestions")
            .select("id, status, checkout_date, checkin_date, suggested_clean_date")
            .eq("property_id", prop.id)
            .eq("external_ref", ev.uid)
            .limit(1);
          const existing = (existingRows as any[])?.[0];

          if (!existing) {
            await supabase.from("booking_suggestions").insert({
              property_id: prop.id,
              source,
              external_ref: ev.uid,
              guest_name: ev.summary || null,
              checkin_date: checkinDate,
              checkout_date: checkoutDate,
              suggested_clean_date: checkoutDate,
              suggested_clean_time: prop.checkout_time || "10:00",
              status: "pending",
            });
            results.push(`${prop.id}: new suggestion ${ev.uid}`);
          } else if (
            existing.status === "pending" &&
            (existing.checkout_date !== checkoutDate || existing.checkin_date !== checkinDate)
          ) {
            // Guest moved their dates — keep the still-pending suggestion in
            // sync. Only shift the suggested clean date if the admin hasn't
            // manually overridden it (still equals the old checkout).
            const patch: Record<string, any> = { checkout_date: checkoutDate, checkin_date: checkinDate };
            if (existing.suggested_clean_date === existing.checkout_date) {
              patch.suggested_clean_date = checkoutDate;
            }
            await supabase.from("booking_suggestions").update(patch).eq("id", existing.id);
            results.push(`${prop.id}: updated suggestion ${ev.uid} -> ${checkoutDate}`);
          }
        }

        // Cancellation cleanup: any still-pending iCal suggestion in the synced
        // window whose event vanished from the feed = guest cancelled / host
        // removed it. Expire it so the clean doesn't linger. Never touch
        // already-approved (converted) suggestions or non-iCal sources.
        const { data: pendingRows } = await supabase
          .from("booking_suggestions")
          .select("id, external_ref")
          .eq("property_id", prop.id)
          .eq("status", "pending")
          .ilike("source", "%ical")
          .gte("checkout_date", todayStr)
          .lte("checkout_date", cutoffStr);
        for (const s of (pendingRows || []) as any[]) {
          if (s.external_ref && !feedUids.has(s.external_ref)) {
            await supabase.from("booking_suggestions").update({ status: "expired" }).eq("id", s.id);
            results.push(`${prop.id}: expired vanished suggestion ${s.external_ref}`);
          }
        }

        await supabase.from("properties").update({ ical_last_sync: new Date().toISOString() }).eq("id", prop.id);
      } catch (err) {
        console.error(`iCal sync error for ${prop.id}:`, err);
        results.push(`${prop.id}: error`);
      }
    }

    // Fire alert if any new suggestions
    if (results.some(r => r.includes("new suggestion"))) {
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const tierRes = await supabase.from("alert_tiers").select("tier, enabled").eq("event_type", "booking_suggestion_pending").maybeSingle();
      const tier = (tierRes.data as any)?.tier || "important";
      if ((tierRes.data as any)?.enabled !== false && admins?.length) {
        await supabase.from("notifications").insert(admins.map((a: any) => ({
          user_id: a.user_id,
          title: "New booking suggestions",
          message: `${results.filter(r => r.includes("new suggestion")).length} new iCal booking(s) need approval`,
          type: "booking_suggestion_pending",
          tier,
          event_type: "booking_suggestion_pending",
          link: "/bookings/suggestions",
        })));
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("iCal sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
