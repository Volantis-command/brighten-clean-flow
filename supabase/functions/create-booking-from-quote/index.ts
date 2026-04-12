import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { quote_id, preferred_date, preferred_time } = await req.json();

    if (!quote_id || !preferred_date || !preferred_time) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: quote_id, preferred_date, preferred_time" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify quote exists and is accepted
    const { data: quote, error: quoteErr } = await adminClient
      .from("quotes")
      .select("id, status, client_name, clean_type, service_type, property_address, sell_price_inc_gst, discounted_price, property_id, frequency")
      .eq("id", quote_id)
      .single();

    if (quoteErr || !quote) {
      return new Response(
        JSON.stringify({ error: "Quote not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (quote.status !== "client_accepted" && quote.status !== "accepted") {
      return new Response(
        JSON.stringify({ error: "Quote is not in accepted state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceIncGst = quote.discounted_price ?? quote.sell_price_inc_gst;
    const priceExGst = priceIncGst ? Number(priceIncGst) / 1.1 : null;

    const { data: job, error: jobErr } = await adminClient
      .from("jobs")
      .insert({
        scheduled_date: preferred_date,
        scheduled_time: preferred_time,
        status: "scheduled",
        price_ex_gst: priceExGst,
        price_inc_gst: priceIncGst,
        linked_quote_id: quote.id,
        property_id: quote.property_id || null,
        frequency: quote.frequency || "one-off",
        notes: `${quote.clean_type || quote.service_type || "Clean"} — ${quote.client_name || "Client"}\n${quote.property_address || ""}`.trim(),
        source: "quote_acceptance",
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

    return new Response(
      JSON.stringify({ job_id: job.id, status: "scheduled" }),
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
