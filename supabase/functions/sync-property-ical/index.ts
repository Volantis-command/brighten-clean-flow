import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";
import { dateInTimeZone, icalTurnoverKey } from "../_shared/turnover-integrity.ts";
import { icalDateToISO, parseICalEvents } from "../_shared/ical.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

        const todayStr = dateInTimeZone("Australia/Brisbane");
        const cutoffStr = dateInTimeZone("Australia/Brisbane", 60);

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
            .select("id, status, checkout_date, checkin_date, suggested_clean_date, suggested_clean_time, created_job_id")
            .eq("property_id", prop.id)
            .eq("external_ref", ev.uid)
            .limit(1);
          const existing = (existingRows as any[])?.[0];

          if (!existing) {
            const { error: insertError } = await supabase.from("booking_suggestions").insert({
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
            if (insertError) throw new Error(`suggestion insert failed: ${insertError.message}`);
            results.push(`${prop.id}: new suggestion ${ev.uid}`);
          } else if (
            ["pending", "converted"].includes(existing.status) &&
            (existing.checkout_date !== checkoutDate || existing.checkin_date !== checkinDate)
          ) {
            // Guest moved their dates. Pending suggestions and already-created
            // jobs both remain linked to the source event for their full life.
            const patch: Record<string, any> = { checkout_date: checkoutDate, checkin_date: checkinDate };
            if (existing.suggested_clean_date === existing.checkout_date) {
              patch.suggested_clean_date = checkoutDate;
            }
            const { error: suggestionUpdateError } = await supabase.from("booking_suggestions").update(patch).eq("id", existing.id);
            if (suggestionUpdateError) throw new Error(`suggestion update failed: ${suggestionUpdateError.message}`);

            if (existing.status === "converted" && existing.created_job_id) {
              const { data: linkedJob, error: linkedJobError } = await supabase
                .from("jobs")
                .select("id,status")
                .eq("id", existing.created_job_id)
                .maybeSingle();
              if (linkedJobError) throw new Error(`linked job lookup failed: ${linkedJobError.message}`);
              if (linkedJob && linkedJob.status !== "completed") {
                const { error: jobUpdateError } = await supabase.from("jobs").update({
                  scheduled_date: patch.suggested_clean_date || existing.suggested_clean_date || checkoutDate,
                  scheduled_time: existing.suggested_clean_time || prop.checkout_time || "10:00",
                  status: linkedJob.status === "cancelled" ? "pending_cleaner" : linkedJob.status,
                  source_turnover_key: icalTurnoverKey(prop.id, ev.uid),
                  source_external_refs: [ev.uid],
                  source_synced_at: new Date().toISOString(),
                  sync_conflict_reason: null,
                }).eq("id", linkedJob.id);
                if (jobUpdateError) throw new Error(`linked job update failed: ${jobUpdateError.message}`);
              }
            }
            results.push(`${prop.id}: updated suggestion ${ev.uid} -> ${checkoutDate}`);
          }
        }

        // Cancellation cleanup follows the event through approval. A vanished
        // event expires a pending suggestion or cancels its uncompleted job.
        const { data: trackedRows, error: trackedRowsError } = await supabase
          .from("booking_suggestions")
          .select("id, external_ref, status, created_job_id")
          .eq("property_id", prop.id)
          .in("status", ["pending", "converted"])
          .ilike("source", "%ical")
          .gte("checkout_date", todayStr)
          .lte("checkout_date", cutoffStr);
        if (trackedRowsError) throw new Error(`tracked suggestion lookup failed: ${trackedRowsError.message}`);
        for (const s of (trackedRows || []) as any[]) {
          if (s.external_ref && !feedUids.has(s.external_ref)) {
            if (s.status === "converted" && s.created_job_id) {
              const { data: linkedJob, error: linkedJobError } = await supabase.from("jobs").select("id,status").eq("id", s.created_job_id).maybeSingle();
              if (linkedJobError) throw new Error(`cancelled linked job lookup failed: ${linkedJobError.message}`);
              if (linkedJob && linkedJob.status !== "completed" && linkedJob.status !== "cancelled") {
                const { error: cancelError } = await supabase.from("jobs").update({
                  status: "cancelled",
                  source_synced_at: new Date().toISOString(),
                  sync_conflict_reason: "The linked iCal event disappeared from the source feed.",
                }).eq("id", linkedJob.id);
                if (cancelError) throw new Error(`linked job cancellation failed: ${cancelError.message}`);
              }
            }
            const { error: expireError } = await supabase.from("booking_suggestions").update({ status: "expired" }).eq("id", s.id);
            if (expireError) throw new Error(`suggestion expiry failed: ${expireError.message}`);
            results.push(`${prop.id}: expired vanished suggestion ${s.external_ref}`);
          }
        }

        const { error: stampError } = await supabase.from("properties").update({ ical_last_sync: new Date().toISOString() }).eq("id", prop.id);
        if (stampError) throw new Error(`sync timestamp failed: ${stampError.message}`);
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
