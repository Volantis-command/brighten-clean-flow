import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { client_id, client_type } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let propertyIds: string[] = [];
    let clientName = "";

    if (client_type === "profile") {
      // Get client_properties
      const { data: cp } = await supabase
        .from("client_properties")
        .select("property_id")
        .eq("client_id", client_id)
        .eq("portal_active", true);
      propertyIds = (cp || []).map((c: any) => c.property_id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", client_id)
        .maybeSingle();
      clientName = profile?.full_name || "";
    } else if (client_type === "property") {
      propertyIds = [client_id];
      const { data: prop } = await supabase
        .from("properties")
        .select("client_name")
        .eq("id", client_id)
        .maybeSingle();
      clientName = prop?.client_name || "";
    } else {
      // quote_request - find properties by address match
      const { data: qr } = await supabase
        .from("quote_requests")
        .select("first_name, last_name, address")
        .eq("id", client_id)
        .maybeSingle();
      clientName = `${qr?.first_name || ''} ${qr?.last_name || ''}`.trim();

      if (qr?.address) {
        const { data: props } = await supabase
          .from("properties")
          .select("id")
          .ilike("address", qr.address);
        propertyIds = (props || []).map((p: any) => p.id);
      }
    }

    // Fetch jobs for these properties
    let jobs: any[] = [];
    if (propertyIds.length > 0) {
      const { data } = await supabase
        .from("jobs")
        .select("id, scheduled_date, scheduled_time, status, price_inc_gst, property_id, cleaner_1_id, feedback_score, notes")
        .in("property_id", propertyIds)
        .order("scheduled_date", { ascending: false });
      jobs = data || [];
    }

    // Get property details
    let properties: any[] = [];
    if (propertyIds.length > 0) {
      const { data } = await supabase
        .from("properties")
        .select("id, property_name, address, suburb, client_type")
        .in("id", propertyIds);
      properties = data || [];
    }

    // Get cleaner names
    const cleanerIds = [...new Set(jobs.map((j: any) => j.cleaner_1_id).filter(Boolean))];
    let cleaners: any[] = [];
    if (cleanerIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", cleanerIds);
      cleaners = data || [];
    }

    // Get feedback
    const jobIds = jobs.map((j: any) => j.id);
    let feedback: any[] = [];
    if (jobIds.length > 0) {
      const { data } = await supabase
        .from("job_feedback")
        .select("job_id, score")
        .in("job_id", jobIds);
      feedback = data || [];
    }

    return new Response(
      JSON.stringify({ clientName, jobs, properties, cleaners, feedback }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
