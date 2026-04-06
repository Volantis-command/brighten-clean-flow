import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { messages } = await req.json();

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch profile, knowledge base, and business stats in parallel
    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.slice(0, 7) + "-01";
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    const [profileRes, kbRes, sopRes, jobsThisMonthRes, jobsTodayRes, recentFeedbackRes, cleanersRes, propertiesRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      serviceClient.from("knowledge_base").select("code, title, content"),
      serviceClient.from("sop_documents").select("sop_code, title, category, content"),
      serviceClient.from("jobs").select("id, status, price_ex_gst, cleaner_1_id, cleaner_2_id, scheduled_date, scheduled_time, property_id, properties(property_name, address)").gte("scheduled_date", monthStart),
      serviceClient.from("jobs").select("id, status, scheduled_time, cleaner_1_id, properties(property_name, address)").eq("scheduled_date", today),
      serviceClient.from("job_feedback").select("score, created_at, client_id").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(20),
      serviceClient.from("profiles").select("id, full_name").limit(100),
      serviceClient.from("properties").select("id, property_name, address, client_name").eq("active", true),
    ]);

    const firstName = profileRes.data?.full_name?.split(" ")[0] || "there";
    const kbRows = kbRes.data;
    const sopRows = sopRes.data;
    const monthJobs = jobsThisMonthRes.data || [];
    const todayJobs = jobsTodayRes.data || [];
    const recentFeedback = recentFeedbackRes.data || [];
    const allCleaners = cleanersRes.data || [];
    const allProperties = propertiesRes.data || [];

    // Build knowledge base context
    let kbContext = "";
    if (kbRows && kbRows.length > 0) {
      kbContext = "\n\nKNOWLEDGE BASE:\n";
      for (const row of kbRows) {
        kbContext += `[${row.code || row.title || "GENERAL"}]: ${row.content || ""}\n`;
      }
    }

    // Build SOP context — Brightly Standard Operating Procedures
    let sopContext = "";
    if (sopRows && sopRows.length > 0) {
      sopContext = "\n\nBRIGHTLY STANDARD OPERATING PROCEDURES (SOPs):\n";
      sopContext += "These are the official Brightly SOPs. When a question relates to procedures, training, cleaning standards, QC, chemical safety, linen, or onboarding — quote from these directly.\n\n";
      for (const row of sopRows) {
        sopContext += `=== [${row.sop_code || "SOP"}] ${row.title} ${row.category ? `(${row.category})` : ""} ===\n${row.content || ""}\n\n`;
      }
    }

    // Build business data context
    const completedThisMonth = monthJobs.filter((j: any) => j.status === "completed");
    const revenueThisMonth = completedThisMonth.reduce((sum: number, j: any) => sum + (Number(j.price_ex_gst) || 0), 0);
    const avgScore = recentFeedback.length > 0 ? (recentFeedback.reduce((s: number, f: any) => s + (f.score || 0), 0) / recentFeedback.length).toFixed(1) : "N/A";

    // Cleaner stats
    const cleanerJobCounts: Record<string, number> = {};
    completedThisMonth.forEach((j: any) => {
      if (j.cleaner_1_id) cleanerJobCounts[j.cleaner_1_id] = (cleanerJobCounts[j.cleaner_1_id] || 0) + 1;
      if (j.cleaner_2_id) cleanerJobCounts[j.cleaner_2_id] = (cleanerJobCounts[j.cleaner_2_id] || 0) + 1;
    });
    const cleanerMap: Record<string, string> = {};
    allCleaners.forEach((c: any) => { cleanerMap[c.id] = c.full_name || "Unknown"; });

    let businessContext = `\n\nBUSINESS DATA SNAPSHOT:
- Date: ${today}
- Jobs completed this month: ${completedThisMonth.length}
- Total jobs this month (all statuses): ${monthJobs.length}
- Revenue this month (ex GST): $${revenueThisMonth.toFixed(2)}
- Average feedback score (last 7 days): ${avgScore}/5
- Jobs today: ${todayJobs.length}
- Active properties: ${allProperties.length}

TODAY'S JOBS:
${todayJobs.map((j: any) => `- ${(j.properties as any)?.property_name || "Unknown"} at ${j.scheduled_time || "TBA"} — Status: ${j.status} — Cleaner: ${cleanerMap[j.cleaner_1_id] || "Unassigned"}`).join("\n") || "No jobs today"}

CLEANER PERFORMANCE THIS MONTH:
${Object.entries(cleanerJobCounts).sort((a, b) => b[1] - a[1]).map(([id, count]) => `- ${cleanerMap[id] || id}: ${count} jobs`).join("\n") || "No data"}

PROPERTIES LIST:
${allProperties.slice(0, 30).map((p: any) => `- ${p.property_name} (${p.address || "no address"}) — Client: ${p.client_name || "N/A"}`).join("\n")}
`;

    const systemPrompt = `You are the Brightly Assistant — an AI-powered business intelligence tool for Brightly Cleaning operations. You help admins understand their business data, track performance, and make decisions.

You have access to real-time business data below. Answer questions accurately using this data. If you can't find specific data, say so honestly.

You also have access to Brightly's Standard Operating Procedures (SOPs). When asked about cleaning standards, training, QC, chemical safety, linen, or staff procedures, refer to the SOP knowledge base below — quote SOP codes (e.g. B-ABNB-HR-002) when relevant.

Be concise, practical, and use numbers. Format responses with markdown when helpful (tables, lists, bold numbers).${kbContext}${sopContext}${businessContext}

The admin's name is "${firstName}". Address them by name occasionally.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please contact admin." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
