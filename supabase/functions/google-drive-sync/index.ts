import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Google Auth helpers ──

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function strToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64url(strToUint8(JSON.stringify(header)));
  const payloadB64 = base64url(strToUint8(JSON.stringify(payload)));
  const unsignedJwt = `${headerB64}.${payloadB64}`;

  // Import PEM private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const keyBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    strToUint8(unsignedJwt)
  );
  const signatureB64 = base64url(new Uint8Array(signature));
  const jwt = `${unsignedJwt}.${signatureB64}`;

  const resp = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${t}`);
  }
  const { access_token } = await resp.json();
  return access_token;
}

// ── Google Drive API helpers ──

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

async function findFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string | null> {
  let q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const resp = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const existing = await findFolder(token, name, parentId);
  if (existing) return existing;

  const body: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];

  const resp = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Create folder failed: ${resp.status} ${t}`);
  }
  const data = await resp.json();
  return data.id;
}

async function createGoogleDoc(
  token: string,
  name: string,
  htmlContent: string,
  parentId: string
): Promise<string> {
  // Multipart upload to create a Google Doc from HTML
  const boundary = "brightly_boundary";
  const metadata = JSON.stringify({
    name,
    mimeType: "application/vnd.google-apps.document",
    parents: [parentId],
  });

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
    `${htmlContent}\r\n` +
    `--${boundary}--`;

  const resp = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Create doc failed: ${resp.status} ${t}`);
  }
  const data = await resp.json();
  return data.id;
}

async function uploadFileToDrive(
  token: string,
  name: string,
  parentId: string,
  fileBlob: Blob,
  mimeType: string
): Promise<string> {
  const boundary = "brightly_upload";
  const metadata = JSON.stringify({
    name,
    parents: [parentId],
  });

  const metaPart = strToUint8(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const filePart = new Uint8Array(await fileBlob.arrayBuffer());
  const endPart = strToUint8(`\r\n--${boundary}--`);

  const body = new Uint8Array(metaPart.length + filePart.length + endPart.length);
  body.set(metaPart, 0);
  body.set(filePart, metaPart.length);
  body.set(endPart, metaPart.length + filePart.length);

  const resp = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Upload file failed: ${resp.status} ${t}`);
  }
  const data = await resp.json();
  return data.id;
}

// ── HTML builders ──

function buildJobFormHtml(job: any, property: any, formData: any, cleanerNames: Record<string, string>): string {
  const c1 = cleanerNames[job.cleaner_1_id] || "Unassigned";
  const c2 = cleanerNames[job.cleaner_2_id] || "None";

  const yesNo = (v: string) => (v === "yes" ? "✅ Yes" : v === "no" ? "❌ No" : "—");

  let html = `<h1>Brightly Clean Form</h1>
<h2>${property.property_name}</h2>
<p><strong>Date:</strong> ${job.scheduled_date} | <strong>Time:</strong> ${job.scheduled_time || "N/A"}</p>
<p><strong>Cleaner 1:</strong> ${c1} | <strong>Cleaner 2:</strong> ${c2}</p>
<hr/>
<h3>1. Arrival</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Property vacant</td><td>${yesNo(formData.property_vacant)}</td></tr>
<tr><td>Entry photo taken</td><td>${yesNo(formData.entry_photo_taken)}</td></tr>
<tr><td>Walk-through completed</td><td>${yesNo(formData.walkthrough_completed)}</td></tr>
<tr><td>Damage noted</td><td>${yesNo(formData.damage_noted)}</td></tr>
</table>`;

  if (formData.damage_noted === "yes" && formData.damage_description) {
    html += `<p><strong>Damage:</strong> ${formData.damage_description}</p>`;
  }

  html += `<h3>2. Linen</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Linen delivered</td><td>${yesNo(formData.linen_delivered)}</td></tr>
<tr><td>Quantity correct</td><td>${yesNo(formData.linen_quantity_correct)}</td></tr>
<tr><td>Damaged linen</td><td>${yesNo(formData.damaged_linen)}</td></tr>
<tr><td>Dirty linen bagged</td><td>${yesNo(formData.dirty_linen_bagged)}</td></tr>
</table>`;

  html += `<h3>3. Strip & Prep</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Beds stripped</td><td>${yesNo(formData.beds_stripped)}</td></tr>
<tr><td>Towels collected</td><td>${yesNo(formData.towels_collected)}</td></tr>
<tr><td>Bins emptied</td><td>${yesNo(formData.bins_emptied)}</td></tr>
<tr><td>Rubbish removed</td><td>${yesNo(formData.rubbish_removed)}</td></tr>
<tr><td>Laundry started</td><td>${yesNo(formData.laundry_started)}</td></tr>
</table>`;

  html += `<h3>4. Kitchen</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Benches</td><td>${yesNo(formData.kitchen_benches)}</td></tr>
<tr><td>Stovetop</td><td>${yesNo(formData.kitchen_stovetop)}</td></tr>
<tr><td>Microwave</td><td>${yesNo(formData.kitchen_microwave)}</td></tr>
<tr><td>Appliances</td><td>${yesNo(formData.kitchen_appliances)}</td></tr>
<tr><td>Fridge</td><td>${yesNo(formData.kitchen_fridge)}</td></tr>
<tr><td>Sink</td><td>${yesNo(formData.kitchen_sink)}</td></tr>
<tr><td>Dishes</td><td>${yesNo(formData.kitchen_dishes)}</td></tr>
<tr><td>Cabinets</td><td>${yesNo(formData.kitchen_cabinets)}</td></tr>
<tr><td>Floor</td><td>${yesNo(formData.kitchen_floor)}</td></tr>
<tr><td>Consumables</td><td>${yesNo(formData.kitchen_consumables)}</td></tr>
</table>`;

  // Bathrooms
  if (formData.bathrooms?.length) {
    formData.bathrooms.forEach((b: any, i: number) => {
      html += `<h3>5. Bathroom ${i + 1}</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Toilet</td><td>${yesNo(b.toilet)}</td></tr>
<tr><td>Shower</td><td>${yesNo(b.shower)}</td></tr>
<tr><td>Sink</td><td>${yesNo(b.sink)}</td></tr>
<tr><td>Tapware</td><td>${yesNo(b.tapware)}</td></tr>
<tr><td>Walls</td><td>${yesNo(b.walls)}</td></tr>
<tr><td>Floor</td><td>${yesNo(b.floor)}</td></tr>
<tr><td>Consumables</td><td>${yesNo(b.consumables)}</td></tr>
</table>`;
    });
  }

  // Bedrooms
  if (formData.bedrooms?.length) {
    formData.bedrooms.forEach((b: any, i: number) => {
      html += `<h3>6. Bedroom ${i + 1}</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Linen</td><td>${yesNo(b.linen)}</td></tr>
<tr><td>Surfaces</td><td>${yesNo(b.surfaces)}</td></tr>
<tr><td>Under bed</td><td>${yesNo(b.under_bed)}</td></tr>
<tr><td>Mirrors</td><td>${yesNo(b.mirrors)}</td></tr>
<tr><td>Wardrobe</td><td>${yesNo(b.wardrobe)}</td></tr>
<tr><td>Floor</td><td>${yesNo(b.floor)}</td></tr>
</table>`;
    });
  }

  html += `<h3>7. Living Areas</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Cushions</td><td>${yesNo(formData.living_cushions)}</td></tr>
<tr><td>Tables</td><td>${yesNo(formData.living_tables)}</td></tr>
<tr><td>Remotes</td><td>${yesNo(formData.living_remotes)}</td></tr>
<tr><td>Shelves</td><td>${yesNo(formData.living_shelves)}</td></tr>
<tr><td>Sofas</td><td>${yesNo(formData.living_sofas)}</td></tr>
<tr><td>Floors</td><td>${yesNo(formData.living_floors)}</td></tr>
<tr><td>Switches</td><td>${yesNo(formData.living_switches)}</td></tr>
<tr><td>Outdoor</td><td>${yesNo(formData.living_outdoor)}</td></tr>
</table>`;

  html += `<h3>8. Final Check</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Final walkthrough</td><td>${yesNo(formData.final_walkthrough)}</td></tr>
<tr><td>Windows</td><td>${yesNo(formData.final_windows)}</td></tr>
<tr><td>Lights</td><td>${yesNo(formData.final_lights)}</td></tr>
<tr><td>Doors</td><td>${yesNo(formData.final_doors)}</td></tr>
</table>`;

  html += `<h3>10. Sign-Off</h3>
<p><strong>Cleaner 1:</strong> ${formData.cleaner1_signoff ? "✅ Signed" : "❌ Not signed"} ${formData.cleaner1_signoff_time || ""}</p>
<p><strong>Cleaner 2:</strong> ${formData.cleaner2_signoff ? "✅ Signed" : "❌ Not signed"} ${formData.cleaner2_signoff_time || ""}</p>`;

  html += `<h3>11. Time</h3>
<p><strong>Time In:</strong> ${formData.time_in || "—"} | <strong>Time Out:</strong> ${formData.time_out || "—"}</p>`;

  if (formData.issues_to_report) {
    html += `<p><strong>Issues:</strong> ${formData.issues_to_report}</p>`;
  }

  return html;
}

function buildQCAuditHtml(audit: any, property: any, inspectorName: string, cleanerName: string): string {
  const scores = audit.scores || {};
  let html = `<h1>Brightly QC Audit — QC-003</h1>
<h2>${property.property_name}</h2>
<p><strong>Date:</strong> ${audit.audit_date}</p>
<p><strong>Inspector:</strong> ${inspectorName} | <strong>Cleaner:</strong> ${cleanerName}</p>
<hr/>
<h3>Results Summary</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Total Score</th><td>${audit.total_score} / ${audit.max_score}</td></tr>
<tr><th>Percentage</th><td>${audit.percentage}%</td></tr>
<tr><th>Result</th><td>${audit.result === "pass" ? "✅ PASS" : "❌ FAIL"}</td></tr>
<tr><th>Action Required</th><td>${audit.action_required ? "Yes" : "No"}</td></tr>
</table>`;

  html += `<h3>Scores Breakdown</h3>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Item</th><th>Score</th></tr>`;
  for (const [key, val] of Object.entries(scores)) {
    const v = val as any;
    html += `<tr><td>${key}</td><td>${v.isNA ? "N/A" : v.score ?? "—"}</td></tr>`;
  }
  html += `</table>`;

  if (audit.positive_feedback) {
    html += `<h3>Positive Feedback</h3><p>${audit.positive_feedback}</p>`;
  }
  if (audit.improvement_feedback) {
    html += `<h3>Areas for Improvement</h3><p>${audit.improvement_feedback}</p>`;
  }
  if (audit.issues_text) {
    html += `<h3>Issues</h3><p>${audit.issues_text}</p>`;
  }
  if (audit.re_clean_date) {
    html += `<p><strong>Re-clean Date:</strong> ${audit.re_clean_date}</p>`;
  }

  return html;
}

function buildPropertyProfileHtml(property: any): string {
  return `<h1>Property Profile</h1>
<h2>${property.property_name}</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><td>Address</td><td>${[property.address, property.suburb, property.state, property.postcode].filter(Boolean).join(", ")}</td></tr>
<tr><td>Type</td><td>${property.property_type || "—"}</td></tr>
<tr><td>Bedrooms</td><td>${property.bedrooms || "—"}</td></tr>
<tr><td>Bathrooms</td><td>${property.bathrooms || "—"}</td></tr>
<tr><td>Access Method</td><td>${property.access_method || "—"}</td></tr>
<tr><td>Access Code</td><td>${property.access_code || "—"}</td></tr>
<tr><td>Access Notes</td><td>${property.access_notes || "—"}</td></tr>
<tr><td>Client</td><td>${property.client_name || "—"}</td></tr>
<tr><td>Billing Email</td><td>${property.billing_email || "—"}</td></tr>
<tr><td>Payment Terms</td><td>${property.payment_terms || "—"}</td></tr>
<tr><td>Clean Frequency</td><td>${property.clean_frequency || "—"}</td></tr>
<tr><td>Turnaround</td><td>${property.turnaround_window || "—"}</td></tr>
<tr><td>Host Preferences</td><td>${property.host_preferences || "—"}</td></tr>
<tr><td>Product Restrictions</td><td>${property.product_restrictions || "None"}</td></tr>
<tr><td>Linen Fold Style</td><td>${property.linen_fold_style || "Standard"}</td></tr>
<tr><td>Amenities Notes</td><td>${property.amenities_notes || "—"}</td></tr>
<tr><td>Status</td><td>${property.status || "—"}</td></tr>
</table>`;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse service account
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const serviceAccount: ServiceAccount = JSON.parse(saJson);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();
    const token = await getAccessToken(serviceAccount);

    // ─── ACTION: sync_job_form ───
    if (action === "sync_job_form") {
      const { job_id } = payload;
      const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { data: job } = await adminClient
        .from("jobs")
        .select("*, properties(*)")
        .eq("id", job_id)
        .single();
      if (!job) throw new Error("Job not found");

      const { data: form } = await adminClient
        .from("job_forms")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!form) throw new Error("Form not found");

      const property = (job as any).properties;
      const propertyName = property?.property_name || "Unknown";

      // Fetch cleaner names
      const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean);
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", cleanerIds);
      const cleanerNames: Record<string, string> = {};
      profiles?.forEach((p: any) => { cleanerNames[p.id] = p.full_name || "Unknown"; });

      // Create folder structure: Cleans / YYYY-MM-DD / PropertyName
      const cleansFolderId = await createFolder(token, "Cleans");
      const dateFolderId = await createFolder(token, job.scheduled_date, cleansFolderId);
      const propFolderId = await createFolder(token, propertyName, dateFolderId);

      // Create Google Doc
      const html = buildJobFormHtml(job, property, form.form_data, cleanerNames);
      const docName = `Clean Form — ${job.scheduled_date} — ${propertyName}`;
      await createGoogleDoc(token, docName, html, propFolderId);

      // Upload photos
      const { data: photos } = await adminClient
        .from("photos")
        .select("*")
        .eq("job_id", job_id);

      if (photos && photos.length > 0) {
        const photosFolderId = await createFolder(token, "Photos", propFolderId);
        for (const photo of photos) {
          if (!photo.file_url) continue;
          try {
            const photoResp = await fetch(photo.file_url);
            if (!photoResp.ok) continue;
            const blob = await photoResp.blob();
            const fileName = `${photo.room_label || "photo"}_${photo.id.slice(0, 8)}.jpg`;
            await uploadFileToDrive(token, fileName, photosFolderId, blob, "image/jpeg");
          } catch (e) {
            console.error(`Failed to upload photo ${photo.id}:`, e);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, action: "sync_job_form" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: sync_qc_audit ───
    if (action === "sync_qc_audit") {
      const { audit_id } = payload;
      const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { data: audit } = await adminClient
        .from("qc_audits")
        .select("*, properties(*)")
        .eq("id", audit_id)
        .single();
      if (!audit) throw new Error("Audit not found");

      const property = (audit as any).properties;
      const propertyName = property?.property_name || "Unknown";

      // Fetch inspector and cleaner names
      const ids = [audit.inspector_id, audit.cleaner_id].filter(Boolean);
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const nameMap: Record<string, string> = {};
      profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name || "Unknown"; });

      // Folder: Cleans / YYYY-MM-DD / PropertyName
      const cleansFolderId = await createFolder(token, "Cleans");
      const dateFolderId = await createFolder(token, audit.audit_date || "Unknown", cleansFolderId);
      const propFolderId = await createFolder(token, propertyName, dateFolderId);

      const html = buildQCAuditHtml(
        audit,
        property,
        nameMap[audit.inspector_id!] || "Unknown",
        nameMap[audit.cleaner_id!] || "Unknown"
      );
      const docName = `QC Audit — ${audit.audit_date} — ${propertyName}`;
      await createGoogleDoc(token, docName, html, propFolderId);

      return new Response(JSON.stringify({ success: true, action: "sync_qc_audit" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: sync_job_folder ───
    // Creates the folder structure without needing a completed form
    if (action === "sync_job_folder") {
      const { job_id } = payload;
      const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { data: job } = await adminClient
        .from("jobs")
        .select("*, properties(property_name)")
        .eq("id", job_id)
        .single();
      if (!job) throw new Error("Job not found");

      const propertyName = (job as any).properties?.property_name || "Unknown";

      // Create folder structure: Brightly Cleans / PropertyName / YYYY-MM-DD
      const cleansFolderId = await createFolder(token, "Brightly Cleans");
      const propFolderId = await createFolder(token, propertyName, cleansFolderId);
      await createFolder(token, job.scheduled_date, propFolderId);

      return new Response(JSON.stringify({ success: true, action: "sync_job_folder" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: sync_property ───
    if (action === "sync_property") {
      const { property_id } = payload;
      const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { data: property } = await adminClient
        .from("properties")
        .select("*")
        .eq("id", property_id)
        .single();
      if (!property) throw new Error("Property not found");

      // Folder: Brightly Cleans / PropertyName
      const cleansFolderId = await createFolder(token, "Brightly Cleans");
      await createFolder(token, property.property_name, cleansFolderId);

      // Also create in Properties folder for profile doc
      const propertiesFolderId = await createFolder(token, "Properties");
      const propFolderId = await createFolder(token, property.property_name, propertiesFolderId);

      const html = buildPropertyProfileHtml(property);
      const docName = `Property Profile — ${property.property_name}`;
      await createGoogleDoc(token, docName, html, propFolderId);

      return new Response(JSON.stringify({ success: true, action: "sync_property" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("google-drive-sync error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
