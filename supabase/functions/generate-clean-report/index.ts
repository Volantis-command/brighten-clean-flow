import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");
    const token = url.searchParams.get("token");
    if (!jobId) return new Response("Missing job_id", { status: 400 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: job } = await admin.from("jobs").select("*, properties(property_name, address, suburb)").eq("id", jobId).single();
    if (!job) return new Response("Job not found", { status: 404 });

    // Authorization: caller must either be a portal client whose token
    // links to the job's property, OR an authenticated staff user.
    // Without one, the endpoint is closed (job_ids are uuids but we
    // shouldn't rely on URL guessability).
    if (token) {
      const { data: tokenRow } = await admin
        .from("client_properties")
        .select("client_id")
        .eq("portal_token", token)
        .eq("portal_active", true)
        .maybeSingle();
      if (!tokenRow) return new Response("Invalid portal token", { status: 403 });
      const { data: ownership } = await admin
        .from("client_properties")
        .select("id")
        .eq("client_id", (tokenRow as any).client_id)
        .eq("property_id", (job as any).property_id)
        .eq("portal_active", true)
        .maybeSingle();
      if (!ownership) return new Response("Token does not own this job's property", { status: 403 });
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return new Response("Missing token or auth header", { status: 401 });
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response("Invalid auth token", { status: 401 });
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "head_cleaner", "cleaner"])
        .limit(1)
        .maybeSingle();
      if (!roleRow) return new Response("Staff role required", { status: 403 });
    }

    const prop = (job as any).properties;

    // Fetch cleaners
    const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean);
    const { data: cleaners } = cleanerIds.length ? await admin.from("profiles").select("full_name").in("id", cleanerIds) : { data: [] };

    // Fetch photos
    const { data: photos } = await admin.from("photos").select("*").eq("job_id", jobId).order("room_label");

    // Fetch QC audit
    const { data: audit } = await admin.from("qc_audits").select("*").eq("job_id", jobId).maybeSingle();

    // Fetch time entries
    const { data: timeEntries } = await admin.from("time_entries").select("*").eq("job_id", jobId);
    const entry = timeEntries?.[0];

    // Fetch issues
    const { data: issues } = await admin.from("property_issues").select("*").eq("job_id", jobId);

    // Group photos by room
    const photosByRoom: Record<string, any[]> = {};
    (photos || []).forEach((p: any) => {
      const room = p.room_label || "General";
      if (!photosByRoom[room]) photosByRoom[room] = [];
      photosByRoom[room].push(p);
    });

    const duration = entry?.total_minutes ? `${Math.floor(entry.total_minutes / 60)}h ${entry.total_minutes % 60}m` : "—";

    // Generate HTML report
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Clean Report — ${prop?.property_name}</title>
<style>
  body { font-family: 'Nunito', Arial, sans-serif; margin: 0; padding: 24px; color: #1a1a1a; background: #fff; }
  .header { text-align: center; margin-bottom: 32px; border-bottom: 3px solid #0C463D; padding-bottom: 16px; }
  .header h1 { color: #0C463D; font-size: 28px; margin: 0; }
  .header p { color: #666; font-size: 14px; margin: 4px 0; }
  .section { margin-bottom: 24px; }
  .section h2 { color: #0C463D; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .field { font-size: 14px; }
  .field .label { color: #888; font-size: 12px; }
  .field .value { font-weight: 700; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  .photos img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; }
  .room-label { font-weight: 700; font-size: 14px; margin-top: 12px; margin-bottom: 4px; }
  .qc-score { font-size: 32px; font-weight: 800; color: ${(audit?.percentage || 0) >= 80 ? '#0C463D' : '#f97316'}; }
  .footer { text-align: center; margin-top: 40px; padding-top: 16px; border-top: 2px solid #0C463D; color: #0C463D; font-weight: 700; font-size: 14px; }
  .issue { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="header">
    <h1>Brightly.</h1>
    <p>Clean Report</p>
  </div>

  <div class="section">
    <h2>${prop?.property_name || 'Property'}</h2>
    <p style="color:#666">${[prop?.address, prop?.suburb].filter(Boolean).join(', ')}</p>
    <div class="grid" style="margin-top:12px">
      <div class="field"><div class="label">Clean Date</div><div class="value">${job.scheduled_date}</div></div>
      <div class="field"><div class="label">Duration</div><div class="value">${duration}</div></div>
      <div class="field"><div class="label">Cleaners</div><div class="value">${(cleaners || []).map((c: any) => c.full_name).join(', ') || '—'}</div></div>
      ${audit ? `<div class="field"><div class="label">QC Score</div><div class="qc-score">${audit.percentage}%</div></div>` : ''}
    </div>
  </div>

  ${Object.entries(photosByRoom).map(([room, roomPhotos]) => `
    <div class="section">
      <div class="room-label">${room}</div>
      <div class="photos">
        ${roomPhotos.map((p: any) => `<img src="${p.file_url}" alt="${room}" />`).join('')}
      </div>
    </div>
  `).join('')}

  ${(issues || []).length > 0 ? `
    <div class="section">
      <h2>Issues Reported</h2>
      ${(issues || []).map((i: any) => `
        <div class="issue">
          <strong>${i.room}</strong>: ${i.description}
          ${i.photo_url ? `<br><img src="${i.photo_url}" style="max-width:150px;border-radius:8px;margin-top:8px" />` : ''}
        </div>
      `).join('')}
    </div>
  ` : ''}

  <div class="footer">Cleaned and certified by Brightly</div>
</body></html>`;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`Error: ${(err as Error).message}`, { status: 500 });
  }
});
