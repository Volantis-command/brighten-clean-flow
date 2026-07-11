import { createClient } from "npm:@supabase/supabase-js@2";
import { addWeeks, addMonths, format } from "npm:date-fns@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getRecurringDates(startDate: string, frequency: string, count: number): string[] {
  const start = new Date(startDate + "T00:00:00");
  const dates: string[] = [];
  for (let i = 1; i <= count; i++) {
    let d: Date;
    if (frequency === "weekly") d = addWeeks(start, i);
    else if (frequency === "fortnightly") d = addWeeks(start, i * 2);
    else if (frequency === "monthly") d = addMonths(start, i);
    else break;
    dates.push(format(d, "yyyy-MM-dd"));
  }
  return dates;
}

function frequencyToIntervalWeeks(f: string): number {
  if (f === "weekly") return 1;
  if (f === "fortnightly") return 2;
  if (f === "monthly") return 4;
  return 1;
}

function recurringCount(f: string): number {
  if (f === "weekly") return 8;
  if (f === "fortnightly") return 4;
  if (f === "monthly") return 2;
  return 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, function: 'create-booking-from-quote' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const raw = await req.text();
    if (!raw) {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = JSON.parse(raw);
    const {
      quote_id,
      property_id: bodyPropertyId,
      preferred_date,
      preferred_time,
      client_name,
      notes,
      source,
      frequency: bodyFrequency,
      price_inc_gst: bodyPriceIncGst,
      cleaner_1_id: bodyCleaner1Id,
      cleaner_2_id: bodyCleaner2Id,
      estimated_duration: bodyEstimatedDuration,
    } = body;

    if (!preferred_date) {
      return new Response(
        JSON.stringify({ error: "preferred_date is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let propertyId = bodyPropertyId || null;
    let priceIncGst = bodyPriceIncGst ? Number(bodyPriceIncGst) : null;
    let priceExGst: number | null = null;
    let linkedQuoteId: string | null = null;
    let frequency = bodyFrequency || "one-off";
    let jobNotes = notes || "";
    let jobSource = source || "client";
    let quote: any = null;
    const cleaner1Id = bodyCleaner1Id || null;
    const cleaner2Id = bodyCleaner2Id || null;
    const estimatedDuration = bodyEstimatedDuration ? Number(bodyEstimatedDuration) : null;

    // ── Scenario 1: Quote-based booking ──
    if (quote_id) {
      const { data: quoteData, error: quoteErr } = await adminClient
        .from("quotes")
        .select("id, status, client_name, clean_type, service_type, property_address, sell_price_inc_gst, sell_price_ex_gst, discounted_price, property_id, frequency, client_phone")
        .eq("id", quote_id)
        .single();

      if (quoteErr || !quoteData) {
        return new Response(
          JSON.stringify({ error: "Quote not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      quote = quoteData;

      if (!["client_accepted", "accepted"].includes(quote.status)) {
        return new Response(
          JSON.stringify({ error: "Quote is not in accepted state" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      priceIncGst = quote.discounted_price ?? quote.sell_price_inc_gst ?? priceIncGst;
      priceExGst = quote.sell_price_ex_gst ?? (priceIncGst ? Number(priceIncGst) / 1.1 : null);
      propertyId = quote.property_id || propertyId;
      linkedQuoteId = quote.id;
      frequency = quote.frequency || frequency;
      if (!jobNotes) {
        jobNotes = `${quote.clean_type || quote.service_type || "Clean"} — ${quote.client_name || client_name || "Client"}\n${quote.property_address || ""}`.trim();
      }
    } else {
      // Non-quote: compute ex-GST from inc-GST
      if (priceIncGst) {
        priceExGst = Number(priceIncGst) / 1.1;
      }
    }

    // ── Idempotency guard ──
    // If this quote already has a (non-cancelled) parent job, it's already been
    // booked. Return that job instead of creating a second one + a whole second
    // recurring series. This kills the double-tap / retry duplicate-booking bug
    // where the quote page marks 'accepted' before this function runs.
    if (linkedQuoteId) {
      const { data: alreadyBooked } = await adminClient
        .from("jobs")
        .select("id, status")
        .eq("linked_quote_id", linkedQuoteId)
        .is("recurring_parent_id", null)
        .neq("status", "cancelled")
        .limit(1);
      if (alreadyBooked && alreadyBooked.length > 0) {
        return new Response(
          JSON.stringify({ job_id: alreadyBooked[0].id, status: alreadyBooked[0].status, already_booked: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Validate scheduled_time (must be HH:MM or null) ──
    const timeRegex = /^\d{2}:\d{2}$/;
    const scheduledTime = preferred_time && timeRegex.test(preferred_time) ? preferred_time : null;

    // ── Insert job ──
    // Quote-accepted jobs land in 'pending_cleaner' (yellow) until an admin assigns a cleaner.
    // See src/lib/jobAssignment.ts for the full state machine.
    const jobStatus = "pending_cleaner";
    // Capture client_name on the job row so jobLabel() never falls back to
    // "Untitled job" even when the quote was built with "Manual entry"
    // (no property_id) or when the properties join is null. NOTE: the jobs
    // table does NOT have a property_address column — address lives on
    // properties and is joined via property_id. PR #32 mistakenly tried to
    // write it here, which broke quote acceptance.
    const jobClientName = (quote as any)?.client_name || client_name || null;

    const { data: job, error: jobErr } = await adminClient
      .from("jobs")
      .insert({
        scheduled_date: preferred_date,
        scheduled_time: scheduledTime,
        status: jobStatus,
        price_ex_gst: priceExGst,
        price_inc_gst: priceIncGst,
        property_id: propertyId,
        linked_quote_id: linkedQuoteId,
        frequency: frequency || "one-off",
        notes: jobNotes,
        source: jobSource,
        client_name: jobClientName,
        cleaner_1_id: cleaner1Id,
        cleaner_2_id: cleaner2Id,
        estimated_duration: estimatedDuration,
      })
      .select("id")
      .single();

    if (jobErr) {
      console.error("Job insert error:", jobErr);
      return new Response(
        JSON.stringify({ error: "Failed to create job", details: jobErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Update quote status to 'booked' ──
    if (linkedQuoteId) {
      await adminClient.from("quotes").update({ status: "booked" }).eq("id", linkedQuoteId);
    }

    // ── Recurring jobs ──
    const normalizedFreq = frequency === "one_off" ? "one-off" : frequency;
    if (normalizedFreq !== "one-off" && job?.id) {
      const count = recurringCount(normalizedFreq);
      if (count > 0) {
        const futureDates = getRecurringDates(preferred_date, normalizedFreq, count);

        // Create job_series
        const { data: seriesData } = await adminClient.from("job_series").insert({
          frequency: normalizedFreq,
          interval_weeks: frequencyToIntervalWeeks(normalizedFreq),
          start_date: preferred_date,
          property_id: propertyId,
          notes: jobNotes,
          price_ex_gst: priceExGst,
        }).select("id").single();

        const seriesId = seriesData?.id || null;

        // Update parent job
        await adminClient.from("jobs").update({
          series_id: seriesId,
          frequency: normalizedFreq,
        }).eq("id", job.id);

        // Insert child jobs
        if (futureDates.length > 0) {
          const childJobs = futureDates.map(d => ({
            property_id: propertyId,
            scheduled_date: d,
            scheduled_time: scheduledTime,
            // Recurring children also land in 'pending_cleaner' — admin must assign a cleaner
            // to each occurrence (or in bulk) before it can turn green.
            status: "pending_cleaner",
            price_ex_gst: priceExGst,
            price_inc_gst: priceIncGst,
            series_id: seriesId,
            frequency: normalizedFreq,
            recurring_parent_id: job.id,
            source: jobSource,
            notes: jobNotes,
          }));
          await adminClient.from("jobs").insert(childJobs);
        }
      }
    }

    return new Response(
      JSON.stringify({ job_id: job.id, status: jobStatus }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
