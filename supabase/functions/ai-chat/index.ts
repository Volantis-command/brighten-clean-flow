import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type KnowledgeItem = {
  code?: string | null;
  sop_code?: string | null;
  title?: string | null;
  content?: string | null;
};

const FALLBACK_STOP_WORDS = new Set([
  "about", "after", "before", "cleaner", "could", "from", "have", "property",
  "should", "their", "there", "these", "they", "what", "when", "where", "which",
  "with", "would",
]);

function sseResponse(text: string) {
  const streamBody = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  return new Response(streamBody, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

function buildKnowledgeFallback(
  messages: Array<{ role: string; content: string }>,
  documents: KnowledgeItem[],
) {
  const question = messages.at(-1)?.content?.toLowerCase() || "";
  const terms = [...new Set((question.match(/[a-z]{4,}/g) || [])
    .filter((term) => !FALLBACK_STOP_WORDS.has(term)))]
    .slice(0, 12);

  const match = documents
    .map((document) => {
      const content = document.content || "";
      const searchable = [document.code, document.sop_code, document.title, content]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const score = terms.reduce(
        (total, term) => total + (searchable.includes(term) ? 1 : 0),
        0,
      );
      const paragraphs = content
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
      const excerpt = paragraphs.find((paragraph) =>
        terms.some((term) => paragraph.toLowerCase().includes(term))
      ) || paragraphs[0] || "";
      return { document, score, excerpt };
    })
    .filter((candidate) => candidate.score > 0 && candidate.excerpt)
    .sort((a, b) => b.score - a.score)[0];

  if (!match) {
    return "I couldn't find a reliable answer in the Brightly SOP library. Please contact your supervisor before proceeding so you do not guess.";
  }

  const code = match.document.sop_code || match.document.code || "Brightly SOP";
  const title = match.document.title || "Official guidance";
  const excerpt = match.excerpt.length > 900
    ? `${match.excerpt.slice(0, 897)}…`
    : match.excerpt;

  return `Based on Brightly's official guidance:\n\n**${code} — ${title}**\n\n${excerpt}\n\nIf the situation is urgent or unclear, pause and contact your supervisor before proceeding.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) throw new Error("AI provider is not configured");

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

    // Resolve the caller's role before loading any operational context. Cleaners
    // receive SOPs and only their own jobs; management retains the business view.
    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.slice(0, 7) + "-01";
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const monthAhead = new Date(Date.now() + 31 * 86400000).toISOString().split("T")[0];

    const [profileRes, roleRes, kbRes, sopRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      serviceClient.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      serviceClient.from("knowledge_base").select("code, title, content"),
      serviceClient.from("sop_documents").select("sop_code, title, category, content"),
    ]);

    const firstName = profileRes.data?.full_name?.split(" ")[0] || "there";
    const callerRole = roleRes.data?.role || "cleaner";
    const cleanerMode = callerRole === "cleaner";
    const kbRows = kbRes.data;
    const sopRows = sopRes.data;

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

    let operationalContext = "";
    if (cleanerMode) {
      const { data: ownJobs } = await serviceClient
        .from("jobs")
        .select("id, status, scheduled_date, scheduled_time, notes, cleaner_1_id, cleaner_2_id, properties(property_name, address)")
        .or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`)
        .gte("scheduled_date", weekAgo)
        .lte("scheduled_date", monthAhead)
        .order("scheduled_date", { ascending: true })
        .limit(50);

      operationalContext = `\n\nYOUR ASSIGNED JOBS (recent and upcoming):
${(ownJobs || []).map((job: any) => `- ${job.scheduled_date} ${job.scheduled_time || "TBA"} — ${(job.properties as any)?.property_name || "Property"} — ${job.status}`).join("\n") || "No assigned jobs in this period."}
`;
    } else {
      const [jobsThisMonthRes, jobsTodayRes, recentFeedbackRes, cleanersRes, propertiesRes] = await Promise.all([
        serviceClient.from("jobs").select("id, status, price_ex_gst, cleaner_1_id, cleaner_2_id, scheduled_date, scheduled_time, property_id, properties(property_name, address)").gte("scheduled_date", monthStart),
        serviceClient.from("jobs").select("id, status, scheduled_time, cleaner_1_id, properties(property_name, address)").eq("scheduled_date", today),
        serviceClient.from("job_feedback").select("score, created_at, client_id").gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(20),
        serviceClient.from("profiles").select("id, full_name").limit(100),
        serviceClient.from("properties").select("id, property_name, address, client_name").eq("active", true),
      ]);
      const monthJobs = jobsThisMonthRes.data || [];
      const todayJobs = jobsTodayRes.data || [];
      const recentFeedback = recentFeedbackRes.data || [];
      const allCleaners = cleanersRes.data || [];
      const allProperties = propertiesRes.data || [];
      const completedThisMonth = monthJobs.filter((job: any) => job.status === "completed");
      const revenueThisMonth = completedThisMonth.reduce((sum: number, job: any) => sum + (Number(job.price_ex_gst) || 0), 0);
      const avgScore = recentFeedback.length > 0 ? (recentFeedback.reduce((sum: number, feedback: any) => sum + (feedback.score || 0), 0) / recentFeedback.length).toFixed(1) : "N/A";
      const cleanerJobCounts: Record<string, number> = {};
      completedThisMonth.forEach((job: any) => {
        if (job.cleaner_1_id) cleanerJobCounts[job.cleaner_1_id] = (cleanerJobCounts[job.cleaner_1_id] || 0) + 1;
        if (job.cleaner_2_id) cleanerJobCounts[job.cleaner_2_id] = (cleanerJobCounts[job.cleaner_2_id] || 0) + 1;
      });
      const cleanerMap: Record<string, string> = {};
      allCleaners.forEach((cleaner: any) => { cleanerMap[cleaner.id] = cleaner.full_name || "Unknown"; });

      operationalContext = `\n\nBUSINESS DATA SNAPSHOT:
- Date: ${today}
- Jobs completed this month: ${completedThisMonth.length}
- Total jobs this month: ${monthJobs.length}
- Revenue this month (ex GST): $${revenueThisMonth.toFixed(2)}
- Average feedback score (last 7 days): ${avgScore}/5
- Jobs today: ${todayJobs.length}
- Active properties: ${allProperties.length}

TODAY'S JOBS:
${todayJobs.map((job: any) => `- ${(job.properties as any)?.property_name || "Unknown"} at ${job.scheduled_time || "TBA"} — ${job.status} — ${cleanerMap[job.cleaner_1_id] || "Unassigned"}`).join("\n") || "No jobs today"}

CLEANER PERFORMANCE THIS MONTH:
${Object.entries(cleanerJobCounts).sort((a, b) => b[1] - a[1]).map(([id, count]) => `- ${cleanerMap[id] || id}: ${count} jobs`).join("\n") || "No data"}

PROPERTIES LIST:
${allProperties.slice(0, 30).map((property: any) => `- ${property.property_name} (${property.address || "no address"}) — Client: ${property.client_name || "N/A"}`).join("\n")}
`;
    }

    const audienceInstructions = cleanerMode
      ? `You are the cleaner-facing Brightly Assistant. Answer practical questions using the official SOPs and the caller's own assigned jobs. Never reveal revenue, pricing, client lists, other cleaners, staff performance, or management-only information. If asked for those, explain that the information is restricted and offer help with SOPs or their own jobs.`
      : `You are the management-facing Brightly Assistant. Help Brightly leaders understand business data, performance and operations.`;

    const systemPrompt = `${audienceInstructions}

Use the SOP knowledge base for cleaning standards, training, QC, chemical safety, linen and staff procedures. Cite the relevant SOP code when practical. If the answer is not present, say so rather than inventing a rule.

Be concise, practical and format responses with markdown when helpful.${kbContext}${sopContext}${operationalContext}

The caller's first name is "${firstName}". Address them by name occasionally.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.slice(-12),
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic API error:", response.status, t);
      return sseResponse(
        buildKnowledgeFallback(
          messages,
          [...((sopRows || []) as KnowledgeItem[]), ...((kbRows || []) as KnowledgeItem[])],
        ),
      );
    }

    const result = await response.json();
    const assistantText = (result.content || [])
      .filter((part: { type?: string; text?: string }) => part.type === "text")
      .map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

    if (!assistantText) throw new Error("AI service returned an empty response");

    return sseResponse(assistantText);
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: "Ask Brightly is temporarily unavailable. Please try again shortly." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
