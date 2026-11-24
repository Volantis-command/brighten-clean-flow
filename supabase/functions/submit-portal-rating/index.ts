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

// Texts ADMIN_PHONE (the same number check-job-alerts uses for no-shows).
// The in-app notification is only seen when someone opens the dashboard.
async function smsAdmin(body: string): Promise<void> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const auth = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  let to = (Deno.env.get("ADMIN_PHONE") || "").replace(/[\s\-()]/g, "");
  if (!sid || !auth || !from || !to) {
    console.error("[submit-portal-rating] admin SMS skipped: Twilio or ADMIN_PHONE not set");
    return;
  }
  if (to.startsWith("0")) to = "+61" + to.slice(1);
  else if (!to.startsWith("+")) to = "+61" + to;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${auth}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) {
    console.error("[submit-portal-rating] admin SMS failed:", res.status, await res.text());
  }
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

    // Notify admins. notify_admins writes one notifications row per admin and
    // honours alert_tiers.enabled. It takes the tier from alert_tiers when a
    // row exists (review_received = 'info' in prod), so p_default_tier alone
    // can't raise a low rating; those rows are bumped to 'important' after.
    // Non-fatal: the rating is already saved. Low ratings also text
    // ADMIN_PHONE, independently of the in-app alert.
    const low = stars <= 3;
    const { data: prop } = await supabase
      .from("properties")
      .select("property_name")
      .eq("id", job.property_id)
      .maybeSingle();
    const note = comment ? `: "${String(comment).slice(0, 140)}"` : "";
    try {
      const { error: notifyErr } = await supabase.rpc("notify_admins", {
        p_event_type: "review_received",
        p_title: low ? "Low portal rating" : "Portal rating",
        p_message: `${stars}-star rating from the client portal for ${prop?.property_name || "property"}${note}${low ? ". Review needed." : ""}`,
        p_link: `/properties/${job.property_id}?tab=feedback`,
        p_metadata: { job_id: job.id, client_id: tokenRow.client_id, stars, source: "portal" },
        p_default_tier: low ? "important" : "info",
      });
      if (notifyErr) throw notifyErr;
      if (low) {
        const { error: tierErr } = await supabase
          .from("notifications")
          .update({ tier: "important" })
          .eq("event_type", "review_received")
          .eq("metadata->>job_id", job.id)
          .eq("tier", "info")
          .eq("read", false);
        if (tierErr) throw tierErr;
      }
    } catch (err) {
      console.error("[submit-portal-rating] admin alert failed:", (err as Error)?.message ?? err);
    }
    if (low) {
      try {
        await smsAdmin(
          `Brightly: ${stars}-star portal rating for ${prop?.property_name || "a property"}${note}. ` +
            `https://app.brightly.cleaning/properties/${job.property_id}?tab=feedback`,
        );
      } catch (err) {
        console.error("[submit-portal-rating] admin SMS failed:", (err as Error)?.message ?? err);
      }
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
