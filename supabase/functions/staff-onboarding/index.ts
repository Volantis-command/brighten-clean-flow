import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "staff-documents";
const VERSION = "B-ABNB-HR-002-v1.1";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DOCUMENTS = new Set([
  "profile_photo",
  "photo_id",
  "public_liability",
]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const ACKNOWLEDGEMENTS = [
  ["cleaning_guest_ready", "I have read and will follow Brightly’s cleaning and guest-ready standards."],
  ["safety_incidents", "I have read and will follow Brightly’s safety and incident-response requirements."],
  ["communication_conduct_training", "I have read and will follow Brightly’s communication, conduct, privacy and training requirements."],
] as const;

const KNOWLEDGE_QUESTIONS = [
  ["clean_sequence", "After stripping linen and emptying bins, which area is cleaned first?", 0],
  ["linen_missing", "What must you do if fresh hire linen has not arrived?", 0],
  ["linen_damage", "What do you do with stained or damaged hire linen?", 0],
  ["chemical_mix", "Which chemical rule is absolute?", 0],
  ["chemical_exposure", "If chemical contacts your skin or eyes, what is the first response?", 0],
  ["urgent_issue", "What do you do for urgent damage, access failure, safety or guest-ready risk?", 0],
  ["completion_evidence", "What evidence is required before marking a job complete?", 0],
  ["job_response", "How quickly must you accept or decline a job assignment?", 0],
  ["late_arrival", "What must happen if you expect to arrive more than 15 minutes late?", 0],
  ["privacy", "Can property access codes or guest details be shared outside the Brightly team?", 0],
] as const;

const PRESTART_KEYS = [
  "abn_provided",
  "bank_details_provided",
  "emergency_contact_provided",
  "id_uploaded",
  "id_verified",
  "master_sop_signed",
  "linen_sop_signed",
  "consumables_sop_signed",
  "quick_reference_reviewed",
  "chemical_induction_passed",
  "brightly_app_tested",
  "kit_issued",
  "welcome_induction_completed",
  "verbal_knowledge_check_completed",
  "shadow_clean_1_completed",
  "shadow_clean_2_completed",
  "shadow_clean_2_qc_passed",
] as const;

const EDITABLE_FIELDS = [
  "full_name",
  "preferred_name",
  "phone",
  "date_of_birth",
  "address",
  "residential_suburb",
  "postcode",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "abn_status",
  "abn",
  "gst_registered",
  "is_contractor",
  "bank_account_name",
  "bank_bsb",
  "bank_account_number",
  "id_document_type",
  "id_confirmed",
  "public_liability_status",
  "public_liability_expiry",
  "drivers_licence_expiry",
  "transport_confirmed",
  "vehicle_rego",
  "available_days",
  "availability_notes",
  "has_whatsapp",
  "brightly_notifications_enabled",
  "communication_acknowledged",
] as const;

type JsonRecord = Record<string, any>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const validAbn = (value: unknown) => {
  const numbers = digits(value).split("").map(Number);
  if (numbers.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  numbers[0] -= 1;
  return numbers.reduce((sum, number, index) => sum + number * weights[index], 0) % 89 === 0;
};
const complete = (value: unknown) =>
  value === true || Boolean(value && typeof value === "object" && (value as JsonRecord).completed);

function publicRecord(record: JsonRecord) {
  const result: JsonRecord = {};
  for (const field of EDITABLE_FIELDS) result[field] = record[field] ?? null;
  Object.assign(result, {
    id: record.id,
    email: record.email,
    status: record.status,
    deployment_status: record.deployment_status,
    submitted_at: record.submitted_at,
    current_step: record.current_step ?? 0,
    onboarding_version: record.onboarding_version ?? VERSION,
    document_manifest: record.document_manifest ?? {},
    sop_acknowledgements: record.sop_acknowledgements ?? {},
    knowledge_check: record.knowledge_check ?? {},
    cleaner_declaration: record.cleaner_declaration ?? {},
    last_saved_at: record.last_saved_at,
  });
  return result;
}

function normaliseDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  // Accepts a two digit year, matching isValidAustralianDate on the client.
  // These two must agree: if the form accepts 01/12/26 and this does not, the
  // date is silently stored as null and the cleaner is told nothing.
  // 00-49 reads as 2000s, 50-99 as 1900s.
  const match = /^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{2}|\d{4}))$/.exec(text);
  if (!match) return null;
  const rawYear = match[1] ?? match[6];
  const year = Number(
    rawYear.length === 2
      ? (Number(rawYear) <= 49 ? 2000 + Number(rawYear) : 1900 + Number(rawYear))
      : rawYear,
  );
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[3] ?? match[4]);
  if (year < 1900 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cleanApplicantPayload(payload: JsonRecord) {
  const update: JsonRecord = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in payload)) continue;
    update[field] = payload[field] === "" ? null : payload[field];
  }
  update.date_of_birth = normaliseDate(payload.date_of_birth);
  update.public_liability_expiry = normaliseDate(payload.public_liability_expiry);
  update.drivers_licence_expiry = normaliseDate(payload.drivers_licence_expiry);
  update.available_days = Array.isArray(payload.available_days) ? payload.available_days : [];
  update.current_step = Math.max(0, Math.min(7, Number(payload.current_step ?? 0)));
  update.sop_acknowledgements = payload.sop_acknowledgements ?? {};
  update.knowledge_check = { answers: payload.knowledge_answers ?? {} };
  update.cleaner_declaration = {
    accurate: Boolean(payload.declaration_accurate),
    compliance: Boolean(payload.declaration_compliance),
  };
  update.digital_signature = String(payload.digital_signature ?? "").trim() || null;
  update.last_saved_at = new Date().toISOString();
  update.onboarding_version = VERSION;
  return update;
}

function validateSubmission(payload: JsonRecord, manifest: JsonRecord) {
  const requiredText = [
    ["full_name", "Full legal name"],
    ["phone", "Mobile number"],
    ["date_of_birth", "Date of birth"],
    ["address", "Residential address"],
    ["residential_suburb", "Suburb"],
    ["postcode", "Postcode"],
    ["emergency_contact_name", "Emergency contact name"],
    ["emergency_contact_phone", "Emergency contact phone"],
    ["emergency_contact_relationship", "Emergency contact relationship"],
    ["abn", "ABN"],
    ["bank_account_name", "Bank account name"],
    ["bank_bsb", "BSB"],
    ["bank_account_number", "Bank account number"],
    ["id_document_type", "ID document type"],
    ["digital_signature", "Digital signature"],
  ] as const;
  for (const [key, label] of requiredText) {
    if (!String(payload[key] ?? "").trim()) return `${label} is required`;
  }
  if (!payload.is_contractor) return "Independent contractor acknowledgement is required";
  if (!normaliseDate(payload.date_of_birth)) return "Enter date of birth as DD/MM/YYYY";
  if (payload.abn_status !== "yes") return "An active ABN is required before onboarding can be submitted";
  if (!validAbn(payload.abn)) return "Enter a valid active ABN";
  if (digits(payload.postcode).length !== 4) return "Postcode must contain 4 digits";
  if (digits(payload.phone).length < 8) return "Mobile number is incomplete";
  if (digits(payload.emergency_contact_phone).length < 8) return "Emergency contact phone is incomplete";
  if (digits(payload.bank_bsb).length !== 6) return "BSB must contain 6 digits";
  if (digits(payload.bank_account_number).length < 6) return "Bank account number is incomplete";
  if (!payload.id_confirmed) return "You must confirm the uploaded ID belongs to you";
  if (!payload.transport_confirmed) return "Reliable transport confirmation is required";
  if (!payload.brightly_notifications_enabled) return "Brightly notifications must be enabled";
  if (!payload.communication_acknowledged) return "Communication requirements must be acknowledged";
  if (!["yes", "no", "in_progress"].includes(String(payload.public_liability_status ?? ""))) {
    return "Public-liability status is required";
  }
  if (payload.id_document_type === "drivers_licence" && !normaliseDate(payload.drivers_licence_expiry)) {
    return "Enter driver licence expiry as DD/MM/YYYY";
  }
  if (!Array.isArray(payload.available_days) || payload.available_days.length === 0) {
    return "At least one available day is required";
  }
  for (const key of ["profile_photo", "photo_id"]) {
    if (!manifest[key]?.path && !manifest[key]?.legacy_url) return `${key.replaceAll("_", " ")} upload is required`;
  }
  if (payload.public_liability_status === "yes" && !manifest.public_liability?.path && !manifest.public_liability?.legacy_url) {
    return "Public-liability evidence is required when you hold a policy";
  }
  if (payload.public_liability_status === "yes" && !normaliseDate(payload.public_liability_expiry)) {
    return "Enter public-liability policy expiry as DD/MM/YYYY";
  }
  const acks = payload.sop_acknowledgements ?? {};
  if (ACKNOWLEDGEMENTS.some(([key]) => acks[key] !== true)) {
    return "Every SOP and policy acknowledgement must be accepted";
  }
  const answers = payload.knowledge_answers ?? {};
  if (KNOWLEDGE_QUESTIONS.some(([key, _prompt, correct]) => Number(answers[key]) !== correct)) {
    return "A perfect knowledge-check score is required";
  }
  if (!payload.declaration_accurate || !payload.declaration_compliance) {
    return "Both final declarations must be accepted";
  }
  if (String(payload.digital_signature).trim().toLowerCase() !== String(payload.full_name).trim().toLowerCase()) {
    return "Digital signature must match the full legal name";
  }
  return null;
}

/**
 * Shadow Clean 2 passes only with a score of 80 or more AND, when it was rated,
 * an outcome of Pass. An 8/10 marked "needs more work" is not a pass. Manual
 * entries from before ratings existed carry no outcome and are judged on score.
 */
function shadowQcPassed(training: JsonRecord) {
  const sc2 = (training?.shadow_clean_2 ?? {}) as JsonRecord;
  return Number(sc2.qc_score ?? 0) >= 80 && (!sc2.outcome || sc2.outcome === "pass");
}

/** Recalculate the training-derived pre-start items from a training record. */
function deriveRequirements(current: JsonRecord, training: JsonRecord, callerId: string, now: string) {
  const next: JsonRecord = { ...current };
  const derived: Record<string, boolean> = {
    welcome_induction_completed: Boolean(training.welcome_induction_date && training.induction_facilitator),
    verbal_knowledge_check_completed: Boolean(training.verbal_check_date),
    brightly_app_tested: Boolean(training.brightly_test_date),
    kit_issued: Boolean(training.kit_issued_date),
    shadow_clean_1_completed: Boolean(
      training.shadow_clean_1?.date
      && training.shadow_clean_1?.supervisor
      && training.shadow_clean_1?.debrief_completed
    ),
    shadow_clean_2_completed: Boolean(
      training.shadow_clean_2?.date
      && training.shadow_clean_2?.supervisor
      && training.shadow_clean_2?.debrief_completed
    ),
  };
  for (const [key, completed] of Object.entries(derived)) {
    next[key] = {
      ...(next[key] ?? {}),
      completed,
      source: "training_record",
      updated_at: now,
      updated_by: callerId,
    };
  }
  next.shadow_clean_2_qc_passed = {
    ...(next.shadow_clean_2_qc_passed ?? {}),
    completed: shadowQcPassed(training),
    score: Number(training?.shadow_clean_2?.qc_score ?? 0),
    updated_at: now,
    updated_by: callerId,
  };
  return next;
}

function pathFromLegacyUrl(value: string | undefined) {
  if (!value) return null;
  const decoded = decodeURIComponent(value);
  for (const marker of [
    "/storage/v1/object/public/staff-documents/",
    "/storage/v1/object/sign/staff-documents/",
    "/storage/v1/object/staff-documents/",
  ]) {
    const index = decoded.indexOf(marker);
    if (index >= 0) return decoded.slice(index + marker.length).split("?")[0];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as JsonRecord;
    const action = String(body.action ?? "load");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const requireAdmin = async () => {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return null;
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await client.auth.getUser();
      if (!user) return null;
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return isAdmin ? user : null;
    };

    // Shadow cleans are run by whoever supervises them: an admin or a head
    // cleaner. Everything else in this function stays admin only.
    const requireLead = async () => {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return null;
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await client.auth.getUser();
      if (!user) return null;
      const [{ data: isAdmin }, { data: isHead }] = await Promise.all([
        admin.rpc("has_role", { _user_id: user.id, _role: "admin" }),
        admin.rpc("has_role", { _user_id: user.id, _role: "head_cleaner" }),
      ]);
      return isAdmin || isHead ? user : null;
    };

    if (["shadow_add", "shadow_rate", "shadow_cancel"].includes(action)) {
      const caller = await requireLead();
      if (!caller) return json({ error: "Only an admin or head cleaner can manage shadow cleans" }, 403);
      const now = new Date().toISOString();

      // Rebuild a trainee's Shadow Clean 1 and 2 from their rated sessions, then
      // re-derive the pre-start checklist, so the training record, the tiles and
      // the deployment gate always move together.
      //   - A Fail never fills a slot; it stays in the history only.
      //   - Shadow Clean 1 is the earliest Pass or Needs more work.
      //   - Shadow Clean 2 is the latest one after that, so a redo replaces a
      //     weaker attempt.
      const recompute = async (traineeId: string) => {
        const { data: record, error: recordError } = await admin
          .from("staff_onboarding")
          .select("id, training_record, prestart_requirements, submitted_at, deployment_status")
          .eq("user_id", traineeId)
          .maybeSingle();
        if (recordError) throw recordError;
        if (!record) return null;

        const { data: rated, error: ratedError } = await admin
          .from("staff_shadow_cleans")
          .select("id, scheduled_date, rating, outcome, notes, supervisor_name")
          .eq("trainee_id", traineeId)
          .eq("status", "rated")
          .order("scheduled_date", { ascending: true })
          .order("rated_at", { ascending: true });
        if (ratedError) throw ratedError;

        const filling = (rated ?? []).filter((r: JsonRecord) => r.outcome === "pass" || r.outcome === "needs_more_work");
        const toSlot = (r: JsonRecord) => ({
          date: r.scheduled_date,
          supervisor: r.supervisor_name || "Brightly",
          debrief_completed: true,
          notes: r.notes ?? "",
          rating_10: r.rating,
          outcome: r.outcome,
          qc_score: Number(r.rating) * 10,
          source: "shadow_session",
          session_id: r.id,
        });

        const training: JsonRecord = { ...(record.training_record ?? {}) };
        const slots: Array<[string, JsonRecord | undefined]> = [
          ["shadow_clean_1", filling[0]],
          ["shadow_clean_2", filling.length > 1 ? filling[filling.length - 1] : undefined],
        ];
        for (const [key, session] of slots) {
          if (session) training[key] = toSlot(session);
          // Clear a slot this system filled whose session was since cancelled or
          // re-rated a Fail. A slot typed in by hand is left alone.
          else if ((training[key] as JsonRecord | undefined)?.source === "shadow_session") delete training[key];
        }
        training.updated_at = now;
        training.updated_by = caller.id;

        const requirements = deriveRequirements((record.prestart_requirements ?? {}) as JsonRecord, training, caller.id, now);
        const { error: saveError } = await admin
          .from("staff_onboarding")
          .update({
            training_record: training,
            prestart_requirements: requirements,
            // Never pull an approved cleaner back into training.
            deployment_status: record.deployment_status === "approved"
              ? "approved"
              : record.submitted_at ? "training" : record.deployment_status,
            updated_at: now,
          })
          .eq("id", record.id);
        if (saveError) throw saveError;
        return { training_record: training, prestart_requirements: requirements };
      };

      if (action === "shadow_add") {
        const traineeId = String(body.trainee_id ?? "");
        const jobId = String(body.job_id ?? "");
        if (!UUID_PATTERN.test(traineeId) || !UUID_PATTERN.test(jobId)) {
          return json({ error: "Choose a cleaner and a job" }, 400);
        }
        const { data: job, error: jobError } = await admin
          .from("jobs")
          .select("id, scheduled_date, scheduled_time, status, cleaner_1_id, cleaner_2_id, properties(property_name, address, suburb)")
          .eq("id", jobId)
          .maybeSingle();
        if (jobError) throw jobError;
        if (!job) return json({ error: "That job no longer exists" }, 404);
        if (["cancelled", "completed"].includes(String(job.status))) {
          return json({ error: `That job is already ${job.status}. Pick an upcoming one.` }, 409);
        }
        if (!job.cleaner_1_id) {
          return json({ error: "Assign Cleaner 1 to this job first. They supervise the shadow clean." }, 409);
        }
        if (job.cleaner_1_id === traineeId || job.cleaner_2_id === traineeId) {
          return json({ error: "That cleaner is already working this job, so it can't be their shadow clean." }, 409);
        }
        const { data: onboarding } = await admin
          .from("staff_onboarding").select("id, director_approved").eq("user_id", traineeId).maybeSingle();
        if (!onboarding) return json({ error: "That cleaner has no onboarding record. Invite them from Staff first." }, 409);
        if (onboarding.director_approved) return json({ error: "That cleaner is already approved for deployment." }, 409);

        const { data: existing } = await admin
          .from("staff_shadow_cleans").select("id")
          .eq("job_id", jobId).eq("trainee_id", traineeId).neq("status", "cancelled")
          .maybeSingle();
        if (existing) return json({ error: "That cleaner is already shadowing this job." }, 409);

        const { data: people } = await admin
          .from("profiles").select("id, full_name, phone").in("id", [traineeId, job.cleaner_1_id]);
        const trainee = ((people ?? []).find((p: JsonRecord) => p.id === traineeId) ?? {}) as JsonRecord;
        const supervisor = ((people ?? []).find((p: JsonRecord) => p.id === job.cleaner_1_id) ?? {}) as JsonRecord;
        const property = ((job as JsonRecord).properties ?? {}) as JsonRecord;
        const address = [property.address, property.suburb].filter(Boolean).join(", ");

        const { data: created, error: insertError } = await admin
          .from("staff_shadow_cleans")
          .insert({
            trainee_id: traineeId,
            trainee_name: trainee.full_name ?? null,
            supervisor_id: job.cleaner_1_id,
            supervisor_name: supervisor.full_name ?? null,
            job_id: jobId,
            scheduled_date: job.scheduled_date,
            scheduled_time: job.scheduled_time ? String(job.scheduled_time) : null,
            property_name: property.property_name ?? null,
            property_address: address || null,
            status: "scheduled",
            created_by: caller.id,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        return json({
          success: true,
          session_id: created.id,
          trainee: { id: traineeId, name: trainee.full_name ?? "", phone: trainee.phone ?? null },
          supervisor: { id: job.cleaner_1_id, name: supervisor.full_name ?? "" },
          job: {
            scheduled_date: job.scheduled_date,
            scheduled_time: job.scheduled_time,
            property_name: property.property_name ?? null,
            property_address: address || null,
          },
        });
      }

      const sessionId = String(body.session_id ?? "");
      if (!UUID_PATTERN.test(sessionId)) return json({ error: "Shadow clean not found" }, 400);
      const { data: session, error: sessionError } = await admin
        .from("staff_shadow_cleans").select("id, trainee_id, status").eq("id", sessionId).maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) return json({ error: "Shadow clean not found" }, 404);

      if (action === "shadow_rate") {
        const rating = Number(body.rating);
        const outcome = String(body.outcome ?? "");
        if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
          return json({ error: "The score must be a whole number from 0 to 10" }, 400);
        }
        if (!["pass", "needs_more_work", "fail"].includes(outcome)) {
          return json({ error: "Choose Pass, Needs more work or Fail" }, 400);
        }
        if (session.status === "cancelled") return json({ error: "That shadow clean was cancelled, so it can't be rated" }, 409);
        const { error: rateError } = await admin
          .from("staff_shadow_cleans")
          .update({
            status: "rated",
            rating,
            outcome,
            notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
            rated_at: now,
            rated_by: caller.id,
            updated_at: now,
          })
          .eq("id", sessionId);
        if (rateError) throw rateError;
        return json({ success: true, ...(await recompute(session.trainee_id)) });
      }

      if (action === "shadow_cancel") {
        if (session.status === "rated") return json({ error: "That shadow clean is already rated. Edit the rating instead." }, 409);
        const { error: cancelError } = await admin
          .from("staff_shadow_cleans")
          .update({ status: "cancelled", updated_at: now })
          .eq("id", sessionId);
        if (cancelError) throw cancelError;
        return json({ success: true, ...(await recompute(session.trainee_id)) });
      }
    }

    if (["admin_update", "document_url", "approve_deployment"].includes(action)) {
      const caller = await requireAdmin();
      if (!caller) return json({ error: "Admin access required" }, 403);
      const staffId = String(body.staff_id ?? "");
      if (!staffId) return json({ error: "staff_id is required" }, 400);

      const { data: record, error } = await admin
        .from("staff_onboarding")
        .select("*")
        .eq("user_id", staffId)
        .maybeSingle();
      if (error) throw error;
      if (!record) return json({ error: "Onboarding record not found" }, 404);

      if (action === "document_url") {
        const key = String(body.document_key ?? "");
        const entry = (record.document_manifest ?? {})[key] as JsonRecord | undefined;
        if (!entry) return json({ error: "Document not found" }, 404);
        const path = entry.path ?? pathFromLegacyUrl(entry.legacy_url);
        if (!path) return json({ error: "Document path is unavailable" }, 404);
        const { data, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(path, 10 * 60);
        if (signedError) throw signedError;
        return json({ url: data.signedUrl });
      }

      if (action === "admin_update") {
        const now = new Date().toISOString();
        const currentRequirements = (record.prestart_requirements ?? {}) as JsonRecord;
        const incomingRequirements = (body.prestart_requirements ?? {}) as JsonRecord;
        const nextRequirements = { ...currentRequirements };
        for (const key of PRESTART_KEYS) {
          if (!(key in incomingRequirements)) continue;
          const incoming = incomingRequirements[key];
          nextRequirements[key] = {
            ...(typeof currentRequirements[key] === "object" ? currentRequirements[key] : {}),
            ...(typeof incoming === "object" ? incoming : { completed: Boolean(incoming) }),
            updated_at: now,
            updated_by: caller.id,
          };
        }
        const training = {
          ...(record.training_record ?? {}),
          ...(body.training_record ?? {}),
          updated_at: now,
          updated_by: caller.id,
        };
        const finalRequirements = deriveRequirements(nextRequirements, training, caller.id, now);
        const { error: updateError } = await admin
          .from("staff_onboarding")
          .update({
            prestart_requirements: finalRequirements,
            training_record: training,
            deployment_status: record.submitted_at ? "training" : record.deployment_status,
            updated_at: now,
          })
          .eq("id", record.id);
        if (updateError) throw updateError;
        return json({ success: true, prestart_requirements: finalRequirements, training_record: training });
      }

      const requirements = (record.prestart_requirements ?? {}) as JsonRecord;
      const missing = PRESTART_KEYS.filter((key) => !complete(requirements[key]));
      if (!record.submitted_at) return json({ error: "The cleaner has not submitted onboarding" }, 409);
      if (missing.length > 0) return json({ error: "Pre-start requirements are incomplete", missing }, 409);
      if (!shadowQcPassed((record.training_record ?? {}) as JsonRecord)) return json({ error: "Shadow Clean 2 needs a Pass and a rating of 8/10 or more" }, 409);
      const now = new Date().toISOString();
      const { error: approveError } = await admin
        .from("staff_onboarding")
        .update({
          director_approved: true,
          director_approved_at: now,
          director_approved_by: caller.id,
          deployment_status: "approved",
          status: "completed",
          updated_at: now,
        })
        .eq("id", record.id);
      if (approveError) throw approveError;
      return json({ success: true, approved_at: now });
    }

    const token = String(body.token ?? "");
    if (!UUID_PATTERN.test(token)) return json({ error: "Invalid onboarding link" }, 404);
    const { data: record, error } = await admin
      .from("staff_onboarding")
      .select("*")
      .eq("onboarding_token", token)
      .maybeSingle();
    if (error) throw error;
    if (!record) return json({ error: "Invalid onboarding link" }, 404);
    if (record.token_expires_at && new Date(record.token_expires_at) < new Date() && !record.submitted_at) {
      return json({ error: "This onboarding link has expired. Ask Brightly for a new link." }, 410);
    }

    if (action === "load") {
      if (record.submitted_at) {
        return json({ record: { submitted_at: record.submitted_at, status: record.status } });
      }
      return json({ record: publicRecord(record) });
    }
    if (record.submitted_at) return json({ error: "This onboarding has already been submitted" }, 409);

    if (action === "save") {
      const payload = cleanApplicantPayload(body.payload ?? {});
      const { error: saveError } = await admin
        .from("staff_onboarding")
        .update({ ...payload, status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", record.id);
      if (saveError) throw saveError;
      return json({ success: true, saved_at: payload.last_saved_at });
    }

    if (action === "create_upload_url") {
      const documentType = String(body.document_type ?? "");
      const mimeType = String(body.mime_type ?? "");
      const fileSize = Number(body.file_size ?? 0);
      const originalName = String(body.file_name ?? "document");
      if (!ALLOWED_DOCUMENTS.has(documentType)) return json({ error: "Unsupported document type" }, 400);
      if (!ALLOWED_MIME_TYPES.has(mimeType)) return json({ error: "Use a JPG, PNG, WebP or PDF file" }, 400);
      if (!fileSize || fileSize > MAX_FILE_BYTES) return json({ error: "File must be smaller than 10 MB" }, 400);
      const extension = originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `staff/${record.user_id}/${documentType}/${crypto.randomUUID()}.${extension}`;
      const { data, error: uploadError } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (uploadError) throw uploadError;
      return json({ path, upload_token: data.token });
    }

    if (action === "record_upload") {
      const documentType = String(body.document_type ?? "");
      const path = String(body.path ?? "");
      const expectedPrefix = `staff/${record.user_id}/${documentType}/`;
      if (!ALLOWED_DOCUMENTS.has(documentType) || !path.startsWith(expectedPrefix)) {
        return json({ error: "Invalid document path" }, 400);
      }
      const folder = path.slice(0, path.lastIndexOf("/"));
      const filename = path.slice(path.lastIndexOf("/") + 1);
      const { data: files, error: listError } = await admin.storage.from(BUCKET).list(folder, { search: filename, limit: 1 });
      if (listError) throw listError;
      if (!files?.some((file) => file.name === filename)) return json({ error: "Uploaded file was not found" }, 404);
      const manifest = {
        ...(record.document_manifest ?? {}),
        [documentType]: {
          path,
          label: String(body.label ?? documentType),
          original_name: String(body.file_name ?? filename),
          mime_type: String(body.mime_type ?? ""),
          size: Number(body.file_size ?? 0),
          uploaded_at: new Date().toISOString(),
        },
      };
      const { error: manifestError } = await admin
        .from("staff_onboarding")
        .update({ document_manifest: manifest, last_saved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", record.id);
      if (manifestError) throw manifestError;
      return json({ success: true, document: manifest[documentType] });
    }

    if (action === "submit") {
      const draft = body.payload ?? {};
      const manifest = (record.document_manifest ?? {}) as JsonRecord;
      const validationError = validateSubmission(draft, manifest);
      if (validationError) return json({ error: validationError }, 400);
      const password = String(body.password ?? "");
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return json({ error: "Password must be at least 8 characters and include a letter and number" }, 400);
      }

      const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(record.user_id);
      if (authLookupError || !authUser.user) return json({ error: "Staff account was not found" }, 404);
      const { error: passwordError } = await admin.auth.admin.updateUserById(record.user_id, {
        password,
        email_confirm: true,
      });
      if (passwordError) throw passwordError;

      const now = new Date().toISOString();
      const acknowledgements = Object.fromEntries(
        ACKNOWLEDGEMENTS.map(([key, prompt]) => [key, {
          acknowledged: true,
          prompt,
          source_version: VERSION,
          acknowledged_at: now,
        }]),
      );
      const answers = draft.knowledge_answers ?? {};
      const questionResults = Object.fromEntries(
        KNOWLEDGE_QUESTIONS.map(([key, prompt, correctIndex]) => [key, {
          prompt,
          selected_index: Number(answers[key]),
          correct_index: correctIndex,
          correct: Number(answers[key]) === correctIndex,
          answered_at: now,
          source_version: VERSION,
        }]),
      );
      const requirements = {
        ...(record.prestart_requirements ?? {}),
        abn_provided: { completed: true, source: "applicant", completed_at: now },
        bank_details_provided: { completed: true, source: "applicant", completed_at: now },
        emergency_contact_provided: { completed: true, source: "applicant", completed_at: now },
        id_uploaded: { completed: true, source: "document", completed_at: now },
        master_sop_signed: { completed: true, source: "acknowledgement", completed_at: now },
        linen_sop_signed: { completed: true, source: "acknowledgement", completed_at: now },
        consumables_sop_signed: { completed: true, source: "acknowledgement", completed_at: now },
        quick_reference_reviewed: { completed: true, source: "acknowledgement", completed_at: now },
        chemical_induction_passed: { completed: true, source: "knowledge_check", completed_at: now },
      };
      const applicant = cleanApplicantPayload({ ...draft, current_step: 7 });
      const { error: submitError } = await admin
        .from("staff_onboarding")
        .update({
          ...applicant,
          email: record.email,
          sop_acknowledgements: acknowledgements,
          knowledge_check: {
            score: KNOWLEDGE_QUESTIONS.length,
            total: KNOWLEDGE_QUESTIONS.length,
            passed: true,
            attempts: Number((record.knowledge_check ?? {}).attempts ?? 0) + 1,
            completed_at: now,
            questions: questionResults,
          },
          prestart_requirements: requirements,
          cleaner_declaration: {
            accurate: true,
            compliance: true,
            prompt: "I have read, understood and agree to comply with all Brightly onboarding, SOP, conduct, privacy, WHS and training requirements.",
            accepted_at: now,
            source_version: VERSION,
          },
          digital_signature: String(draft.digital_signature).trim(),
          signed_at: now,
          sops_resign_due: new Date(new Date(now).setFullYear(new Date(now).getFullYear() + 1)).toISOString().slice(0, 10),
          submitted_at: now,
          status: "submitted",
          deployment_status: "submitted",
          token_expires_at: null,
          updated_at: now,
        })
        .eq("id", record.id);
      if (submitError) throw submitError;

      const dayMap: Record<string, string> = {
        Monday: "mon", Tuesday: "tue", Wednesday: "wed", Thursday: "thu",
        Friday: "fri", Saturday: "sat", Sunday: "sun",
      };
      await admin.from("profiles").update({
        full_name: draft.full_name,
        phone: draft.phone,
        email: record.email,
        employment_type: "contractor",
        weekly_availability: (draft.available_days ?? []).map((day: string) => dayMap[day]).filter(Boolean),
      }).eq("id", record.user_id);

      const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
      if (admins?.length) {
        await admin.from("notifications").insert(admins.map(({ user_id }) => ({
          user_id,
          title: "Cleaner onboarding ready for review",
          message: `${draft.full_name} submitted every onboarding section and is ready for document review and training.`,
          type: "cleaner_onboarding_complete",
          event_type: "cleaner_onboarding_complete",
          tier: "important",
          link: "/staff",
          read: false,
          metadata: { staff_id: record.user_id, onboarding_version: VERSION },
        })));
      }

      return json({
        success: true,
        email: authUser.user.email ?? record.email,
        submitted_at: now,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("staff-onboarding error", error);
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unexpected error";
    return json({ error: message }, 500);
  }
});
