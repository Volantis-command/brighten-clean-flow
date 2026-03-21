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

    // Fetch profile, today's jobs, and knowledge base in parallel
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [profileRes, jobsRes, kbRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("jobs")
        .select("*, properties(*)")
        .or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`)
        .eq("scheduled_date", new Date().toISOString().split("T")[0]),
      serviceClient.from("knowledge_base").select("code, title, content"),
    ]);

    const firstName = profileRes.data?.full_name?.split(" ")[0] || "there";
    const jobs = jobsRes.data;
    const kbRows = kbRes.data;

    // Build knowledge base context
    let kbContext = "";
    if (kbRows && kbRows.length > 0) {
      kbContext = "\n\nKNOWLEDGE BASE:\n";
      for (const row of kbRows) {
        kbContext += `[${row.code || row.title || "GENERAL"}]: ${row.content || ""}\n`;
      }
    }

    // Build job context
    let jobContext = "";
    if (jobs && jobs.length > 0) {
      jobContext = "\n\nCURRENT JOB DATA FOR TODAY:\n";
      for (const job of jobs) {
        const p = job.properties as any;
        jobContext += `\nJob ID: ${job.id}
Status: ${job.status}
Scheduled: ${job.scheduled_time || "No time set"}
Notes: ${job.notes || "None"}
Property: ${p?.property_name || "Unknown"}
Address: ${p?.address || ""}, ${p?.suburb || ""} ${p?.state || ""} ${p?.postcode || ""}
Bedrooms: ${p?.bedrooms || "?"}
Bathrooms: ${p?.bathrooms || "?"}
Access Method: ${p?.access_method || "Not specified"}
Access Code: ${p?.access_code || "Not set"}
Access Notes: ${p?.access_notes || "None"}
Host Preferences: ${p?.host_preferences || "None"}
Product Restrictions: ${p?.product_restrictions || "None"}
Linen Fold Style: ${p?.linen_fold_style || "Standard"}
Amenities Notes: ${p?.amenities_notes || "None"}
Clean Frequency: ${p?.clean_frequency || "Not set"}
`;
      }
    } else {
      jobContext = "\n\nNo jobs assigned to this cleaner today.";
    }

    const systemPrompt = `You are the Brightly Operations Assistant. You have full knowledge of Brightly's SOPs, QC standards, HR policies, linen procedures, consumables, property onboarding, and finance processes. Use the knowledge base below to answer staff questions accurately and practically. Staff are usually on their phone mid-job — be concise. Always answer in the context of Brightly operations.${kbContext}${jobContext}\n\nThe cleaner's first name is "${firstName}". Address them by name occasionally.`;

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
