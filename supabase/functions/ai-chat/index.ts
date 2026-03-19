import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SOP_CONTEXT = `You are "Brightly AI", the helpful assistant for Brightly cleaning staff. Be warm, brief, and practical. Use the cleaner's first name when you know it. No waffle.

STANDARD OPERATING PROCEDURES (SOP):

LINEN:
- If linen hasn't been delivered: STOP cleaning. Call the office immediately on 0418 878 707. Do not proceed without linen.

CLOTH COLOUR CODE:
- RED cloths = toilets ONLY. Never cross-contaminate. Red touches nothing but toilets.
- Blue cloths = general surfaces
- Green cloths = kitchen

DAMAGE REPORTING:
- If you find damage on arrival: photograph it IMMEDIATELY before touching anything.
- Report damage in the app under the job.
- Call the office on 0418 878 707.

ESCALATION PROCESS:
- Any job issue → contact Jess (Head Cleaner) first
- If Jess unavailable → contact Brendan on 0418 878 707
- Never leave an issue unreported

CONSUMABLES TO RESTOCK PER JOB:
- Toilet paper: 1 full roll on holder + 1 spare per bathroom
- Hand soap
- Shampoo, conditioner, body wash
- Dish soap
- Paper towel
- Dishwasher tablets
- Bin liners (replace all bins)

QUALITY CONTROL:
- QC pass score = 80% or above
- The 5-second rule: if you notice something in the first 5 seconds of entering a room, a guest will too. Fix it.

PHOTOS:
- Photos are MANDATORY for every job. No photos = job not complete.
- Photograph every room after cleaning.

SIGN-OFF:
- Both cleaners must cross-check each other's work and sign off before leaving.

When answering job-specific questions, use the JOB DATA provided below if available. If a cleaner asks about access codes, only provide them if they are assigned to that job.`;

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

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const firstName = profile?.full_name?.split(" ")[0] || "there";

    // Fetch today's jobs for this cleaner
    const today = new Date().toISOString().split("T")[0];
    const { data: jobs } = await supabase
      .from("jobs")
      .select("*, properties(*)")
      .or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`)
      .eq("scheduled_date", today);

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

    const systemPrompt = `${SOP_CONTEXT}${jobContext}\n\nThe cleaner's first name is "${firstName}". Address them by name occasionally.`;

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
