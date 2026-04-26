import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Star rating from the portal (1–5 stars). Stored as 1–10 score in
// job_feedback to match the existing scale used by the SMS feedback flow
// and the FeedbackPage wizard.
function starsToScore(stars: number): number {
  return Math.max(1, Math.min(5, Math.round(stars))) * 2;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, function: "submit-portal-rating" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, job_id, stars, comment } = await req.json();
    if (!token || !job_id || !stars) {
      return new Response(JSON.stringify({ error: "token, job_id, stars required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Resolve the portal token to a client_id.
    const { data: tokenRow } = await supabase
      .from("client_properties")
      .select("client_id")
      .eq("portal_token", token)
      .eq("portal_active", true)
      .maybeSingle();
    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "invalid or inactive portal link" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verify the job belongs to a property that belongs to this client.
    //    Stops a token-holder from rating someone else's clean.
    const { data: job } = await supabase
      .from("jobs")
      .select("id, property_id, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownership } = await supabase
      .from("client_properties")
      .select("id")
      .eq("client_id", tokenRow.client_id)
      .eq("property_id", job.property_id)
      .eq("portal_active", true)
      .maybeSingle();
    if (!ownership) {
      return new Response(JSON.stringify({ error: "you do not own this property" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const score = starsToScore(stars);

    // 3. Upsert the feedback row. Mirrors the (job_id, client_id) conflict
    //    target used by twilio-inbound-sms so a clean can't be double-rated.
    const { error: upsertErr } = await supabase
      .from("job_feedback")
      .upsert(
        {
          job_id: job.id,
          property_id: job.property_id,
          client_id: tokenRow.client_id,
          score,
          comments: comment || `Portal rating: ${stars} stars`,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "job_id,client_id", ignoreDuplicates: false }
      );
    if (upsertErr) throw upsertErr;

    // Mirror onto jobs.feedback_score for dashboards.
    await supabase.from("jobs").update({ feedback_score: score }).eq("id", job.id);

    // Notify admin — same alert shape as the SMS / wizard paths.
    try {
      const { data: prop } = await supabase
        .from("properties")
        .select("property_name")
        .eq("id", job.property_id)
        .maybeSingle();
      await supabase.from("alerts").insert({
        event_type: "review_received",
        title: "Portal Rating",
        body: `${stars}-star rating from portal for ${prop?.property_name || "property"}${stars <= 3 ? " ⚠ Review needed" : ""}`,
        link: `/clients/${tokenRow.client_id}`,
        severity: stars <= 3 ? "warning" : "info",
      });
    } catch (_) {
      // Non-fatal — rating still saved.
    }

    return new Response(JSON.stringify({ ok: true, score }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
