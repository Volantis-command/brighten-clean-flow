import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "staff-documents";
const VERSION = "B-ABNB-HR-002-v1.0";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DOCUMENTS = new Set([
  "profile_photo",
  "photo_id",
  "police_check",
  "public_liability",
  "work_rights",
]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const ACKNOWLEDGEMENTS = [
  ["engagement", "I understand and accept Brightly’s independent contractor engagement terms."],
  ["master_housekeeping", "I have read and understood the Master Housekeeping SOP (B-ABNB-SOP-004)."],
  ["linen_laundry", "I have read and understood the Linen & Laundry SOP (B-ABNB-SOP-005)."],
  ["consumables", "I have read and understood the Consumables & Amenity Restocking SOP (B-ABNB-SOP-006)."],
  ["pre_guest_inspection", "I have read and understood the Pre-Guest Arrival Inspection Checklist (B-ABNB-QC-001)."],
  ["quick_reference", "I have received and reviewed the Cleaner Quick Reference (B-ABNB-REF-001)."],
  ["cleaning_standards", "I understand Brightly’s non-negotiable cleaning and presentation standards."],
  ["chemical_safety", "I understand and will follow Brightly’s chemical safety and PPE requirements."],
  ["incident_reporting", "I understand the incident, injury, chemical exposure and spill-response process."],
  ["communication_scheduling", "I understand Brightly’s job acceptance, attendance and urgent communication requirements."],
  ["privacy_confidentiality", "I will protect all guest, client, property and Brightly information."],
  ["conduct_performance", "I understand the conduct and performance standards and the breaches that may result in removal from Brightly."],
  ["shadow_cleans", "I understand the shadow-clean, QC and Director approval requirements before solo work."],
  ["ongoing_training", "I understand that training and SOP acknowledgement continue after initial deployment."],
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
  "police_check_received",
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
  "police_check_date",
  "public_liability_status",
  "public_liability_expiry",
  "work_rights_status",
  "drivers_licence_expiry",
  "transport_confirmed",
  "vehicle_rego",
  "available_days",
  "preferred_start_time",
  "max_jobs_per_day",
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
  return text || null;
}

function cleanApplicantPayload(payload: JsonRecord) {
  const update: JsonRecord = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in payload)) continue;
    update[field] = payload[field] === "" ? null : payload[field];
  }
  update.date_of_birth = normaliseDate(payload.date_of_birth);
  update.police_check_date = normaliseDate(payload.police_check_date);
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
    ["police_check_date", "Police check date"],
    ["preferred_start_time", "Preferred start time"],
    ["max_jobs_per_day", "Maximum jobs per day"],
    ["digital_signature", "Digital signature"],
  ] as const;
  for (const [key, label] of requiredText) {
    if (!String(payload[key] ?? "").trim()) return `${label} is required`;
  }
  if (!payload.is_contractor) return "Independent contractor acknowledgement is required";
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
  if (!["citizen_or_pr", "visa", "other"].includes(String(payload.work_rights_status ?? ""))) {
    return "Work-rights status is required";
  }
  if (!["yes", "no", "in_progress"].includes(String(payload.public_liability_status ?? ""))) {
    return "Public-liability status is required";
  }
  if (payload.id_document_type === "drivers_licence" && !payload.drivers_licence_expiry) {
    return "Driver licence expiry is required";
  }
  if (!Array.isArray(payload.available_days) || payload.available_days.length === 0) {
    return "At least one available day is required";
  }
  for (const key of ["profile_photo", "photo_id", "police_check"]) {
    if (!manifest[key]?.path && !manifest[key]?.legacy_url) return `${key.replaceAll("_", " ")} upload is required`;
  }
  if (payload.public_liability_status === "yes" && !manifest.public_liability?.path && !manifest.public_liability?.legacy_url) {
    return "Public-liability evidence is required when you hold a policy";
  }
  if (payload.public_liability_status === "yes" && !payload.public_liability_expiry) {
    return "Public-liability policy expiry is required";
  }
  if (payload.work_rights_status === "visa" && !manifest.work_rights?.path && !manifest.work_rights?.legacy_url) {
    return "Work-rights evidence is required for visa holders";
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
        const score = Number(training?.shadow_clean_2?.qc_score ?? 0);
        const derivedRequirements: Record<string, boolean> = {
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
        for (const [key, completed] of Object.entries(derivedRequirements)) {
          nextRequirements[key] = {
            ...(nextRequirements[key] ?? {}),
            completed,
            source: "training_record",
            updated_at: now,
            updated_by: caller.id,
          };
        }
        nextRequirements.shadow_clean_2_qc_passed = {
          ...(nextRequirements.shadow_clean_2_qc_passed ?? {}),
          completed: score >= 80,
          score,
          updated_at: now,
          updated_by: caller.id,
        };
        const { error: updateError } = await admin
          .from("staff_onboarding")
          .update({
            prestart_requirements: nextRequirements,
            training_record: training,
            deployment_status: record.submitted_at ? "training" : record.deployment_status,
            updated_at: now,
          })
          .eq("id", record.id);
        if (updateError) throw updateError;
        return json({ success: true, prestart_requirements: nextRequirements, training_record: training });
      }

      const requirements = (record.prestart_requirements ?? {}) as JsonRecord;
      const missing = PRESTART_KEYS.filter((key) => !complete(requirements[key]));
      const qcScore = Number((record.training_record ?? {})?.shadow_clean_2?.qc_score ?? 0);
      if (!record.submitted_at) return json({ error: "The cleaner has not submitted onboarding" }, 409);
      if (missing.length > 0) return json({ error: "Pre-start requirements are incomplete", missing }, 409);
      if (qcScore < 80) return json({ error: "Shadow Clean 2 QC score must be at least 80%" }, 409);
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
        police_check_received: { completed: true, source: "document", completed_at: now },
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
