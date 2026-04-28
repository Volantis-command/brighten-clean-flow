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
    let clientEmail = "";
    let clientPhone = "";

    if (client_type === "profile") {
      const { data: cp } = await supabase
        .from("client_properties")
        .select("property_id")
        .eq("client_id", client_id)
        .eq("portal_active", true);
      propertyIds = (cp || []).map((c: any) => c.property_id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", client_id)
        .maybeSingle();
      clientName = profile?.full_name || "";
      clientEmail = profile?.email || "";
      clientPhone = profile?.phone || "";
    } else if (client_type === "property") {
      propertyIds = [client_id];
      const { data: prop } = await supabase
        .from("properties")
        .select("client_name, billing_email, client_phone")
        .eq("id", client_id)
        .maybeSingle();
      clientName = prop?.client_name || "";
      clientEmail = prop?.billing_email || "";
      clientPhone = prop?.client_phone || "";
    } else {
      const { data: qr } = await supabase
        .from("quote_requests")
        .select("first_name, last_name, address, email, phone")
        .eq("id", client_id)
        .maybeSingle();
      clientName = `${qr?.first_name || ''} ${qr?.last_name || ''}`.trim();
      clientEmail = qr?.email || "";
      clientPhone = qr?.phone || "";

      if (qr?.address) {
        const { data: props } = await supabase
          .from("properties")
          .select("id")
          .ilike("address", qr.address);
        propertyIds = (props || []).map((p: any) => p.id);
      }
    }

    // Fetch jobs
    let jobs: any[] = [];
    if (propertyIds.length > 0) {
      const { data } = await supabase
        .from("jobs")
        .select("id, scheduled_date, scheduled_time, status, price_inc_gst, price_ex_gst, property_id, cleaner_1_id, cleaner_2_id, feedback_score, notes, clean_type, invoice_status, invoice_amount, xero_invoice_number, invoice_raised_at, invoice_sent_at, invoice_paid_at, report_token")
        .in("property_id", propertyIds)
        .order("scheduled_date", { ascending: false });
      jobs = data || [];
    }

    // Properties
    let properties: any[] = [];
    if (propertyIds.length > 0) {
      const { data } = await supabase
        .from("properties")
        .select("id, property_name, address, suburb, client_type, bedrooms, bathrooms")
        .in("id", propertyIds);
      properties = data || [];
    }

    // Cleaners
    const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
    let cleaners: any[] = [];
    if (cleanerIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", cleanerIds);
      cleaners = data || [];
    }

    // Feedback
    const jobIds = jobs.map((j: any) => j.id);
    let feedback: any[] = [];
    if (jobIds.length > 0) {
      const { data } = await supabase
        .from("job_feedback")
        .select("job_id, score")
        .in("job_id", jobIds);
      feedback = data || [];
    }

    // Quotes — lookup by email or phone
    let quotes: any[] = [];
    if (clientEmail) {
      const { data } = await supabase
        .from("quotes")
        .select("*")
        .ilike("client_email", clientEmail)
        .order("created_at", { ascending: false });
      quotes = data || [];
    }
    if (clientPhone) {
      const { data } = await supabase
        .from("quotes")
        .select("*")
        .eq("client_phone", clientPhone)
        .order("created_at", { ascending: false });
      const existingIds = new Set(quotes.map(q => q.id));
      (data || []).forEach(q => { if (!existingIds.has(q.id)) quotes.push(q); });
    }

    return new Response(
      JSON.stringify({ clientName, jobs, properties, cleaners, feedback, quotes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
