export const STAFF_ONBOARDING_VERSION = 'B-ABNB-HR-002-v1.1';

export const STAFF_ONBOARDING_STEPS = [
  'Personal details',
  'Contractor & payment',
  'Identity & compliance',
  'Availability & logistics',
  'Brightly communication',
  'Standards & SOPs',
  'Knowledge check',
  'Declaration & account',
] as const;

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type OnboardingAcknowledgement = {
  key: string;
  title: string;
  source: string;
  summary: string;
  declaration: string;
  details: { title: string; body: string }[];
  legacyKeys: string[];
};

export const INDEPENDENT_CONTRACTOR_TERMS = [
  {
    title: 'Your working arrangement',
    body: 'You provide cleaning services to Brightly as an independent contractor, not as an employee. Brightly may offer work when it is available, but there are no guaranteed hours or minimum number of jobs.',
  },
  {
    title: 'Accepting work',
    body: 'You can accept or decline offered jobs. Once you accept a job, you are responsible for attending on time, completing the Brightly checklist and promptly reporting anything that could affect safety or the incoming guest.',
  },
  {
    title: 'Payment, ABN and tax',
    body: 'Payment is made at the agreed per-job or hourly rate. You must maintain an active ABN and are responsible for your own tax, GST and other contractor obligations.',
  },
  {
    title: 'Brightly standards',
    body: 'Accepted work must be completed to Brightly’s current cleaning, presentation, safety, privacy and communication standards. Access codes, guest information and client information must remain confidential.',
  },
] as const;

export const ONBOARDING_ACKNOWLEDGEMENTS: OnboardingAcknowledgement[] = [
  {
    key: 'cleaning_guest_ready',
    title: 'Cleaning & guest-ready standards',
    source: 'SOP-004 · SOP-005 · SOP-006 · QC-001 · REF-001',
    summary: 'The complete clean, linen, restocking, presentation, photo and final-inspection standard in one readable section.',
    declaration: 'I have read and will follow Brightly’s cleaning and guest-ready standards.',
    legacyKeys: ['master_housekeeping', 'linen_laundry', 'consumables', 'pre_guest_inspection', 'quick_reference', 'cleaning_standards'],
    details: [
      { title: 'Sequence of clean', body: 'Confirm the property is vacant, strip linen and empty bins, then complete the kitchen, bathrooms, bedrooms and living areas in the required order. Finish with a complete inspection, room photos, lock-up and job completion in Brightly.' },
      { title: 'Linen and laundry', body: 'Bag used hire linen, tag and report damaged or stained items, never discard hire linen and never reuse unchecked linen. If fresh linen has not arrived, call the office before starting.' },
      { title: 'Restocking and presentation', body: 'Restock every property to its documented level. Beds must be symmetrical and wrinkle-free; bathrooms sanitised and hair-free; kitchens clean and dry; products hidden; and windows and doors secured.' },
      { title: 'Guest-ready evidence', body: 'Complete the final inspection, photograph every room and report missing items, damage or anything that may affect the incoming guest before marking the job complete.' },
    ],
  },
  {
    key: 'safety_incidents',
    title: 'Safety, chemicals & incident response',
    source: 'B-ABNB-HR-002 · WHS',
    summary: 'Chemical handling, required PPE and the exact response for injuries, exposure, spills and emergencies.',
    declaration: 'I have read and will follow Brightly’s safety and incident-response requirements.',
    legacyKeys: ['chemical_safety', 'incident_reporting'],
    details: [
      { title: 'Chemical safety and PPE', body: 'Never mix chemicals. Keep every product in its labelled container. Wear rubber gloves for chemicals, bathrooms and kitchens, safety glasses for overhead or confined spraying, and closed-toe slip-resistant footwear.' },
      { title: 'Exposure and spills', body: 'For chemical contact with skin or eyes, rinse with running water for at least 15 minutes. Isolate and ventilate spills and contact Brightly immediately for instructions.' },
      { title: 'Injury or emergency', body: 'Call 000 for a life-threatening event, notify Brendan immediately and complete the required incident report within 24 hours.' },
    ],
  },
  {
    key: 'communication_conduct_training',
    title: 'Communication, conduct & training',
    source: 'HR-001 · HR-002 · HR-005',
    summary: 'How jobs are communicated, confidentiality, professional conduct, shadow cleans and ongoing training.',
    declaration: 'I have read and will follow Brightly’s communication, conduct, privacy and training requirements.',
    legacyKeys: ['communication_scheduling', 'privacy_confidentiality', 'conduct_performance', 'shadow_cleans', 'ongoing_training'],
    details: [
      { title: 'Communication and attendance', body: 'Brightly is the source of truth for jobs, checklists, time and photos. Accept or decline assignments within 2 hours. Call about schedule changes within 24 hours, notify the head cleaner before start time if you will be more than 15 minutes late, and call immediately for urgent access, damage, safety or guest-ready risks.' },
      { title: 'Privacy and confidentiality', body: 'Never share property access codes, entry details, guest information, client contacts or Brightly pricing. Do not contact a host unless Brightly specifically instructs you to.' },
      { title: 'Professional conduct', body: 'Arrive on time, complete every checklist item, provide the required photos, respect guest belongings, and do not smoke, eat or make unnecessary personal calls inside a property.' },
      { title: 'Training and solo work', body: 'Complete at least two supervised shadow cleans. Shadow Clean 2 requires a QC score of 80% or higher. Only the Director can approve solo deployment, and retraining or annual re-acknowledgement may be required.' },
    ],
  },
];

export type KnowledgeQuestion = {
  key: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  source: string;
};

export const ONBOARDING_KNOWLEDGE_QUESTIONS: KnowledgeQuestion[] = [
  {
    key: 'clean_sequence',
    prompt: 'After stripping linen and emptying bins, which area is cleaned first?',
    options: ['Kitchen', 'Bedrooms', 'Living areas', 'Balcony'],
    correctIndex: 0,
    source: 'B-ABNB-HR-002 · Sequence of Clean',
  },
  {
    key: 'linen_missing',
    prompt: 'What must you do if fresh hire linen has not arrived?',
    options: ['Call the office and do not begin the clean', 'Reuse the best-looking linen', 'Buy linen yourself', 'Start and make the beds later'],
    correctIndex: 0,
    source: 'B-ABNB-HR-002 · Linen Handling',
  },
  {
    key: 'linen_damage',
    prompt: 'What do you do with stained or damaged hire linen?',
    options: ['Tag and report it; do not discard it', 'Put it in the bin', 'Take it home', 'Use it if the stain is small'],
    correctIndex: 0,
    source: 'B-ABNB-HR-002 · Linen Handling',
  },
  {
    key: 'chemical_mix',
    prompt: 'Which chemical rule is absolute?',
    options: ['Never mix chemicals, especially bleach and ammonia-based products', 'Mix products only in bathrooms', 'Unlabelled bottles are acceptable for one job', 'PPE is optional for short cleans'],
    correctIndex: 0,
    source: 'B-ABNB-HR-002 · Chemical Safety',
  },
  {
    key: 'chemical_exposure',
    prompt: 'If chemical contacts your skin or eyes, what is the first response?',
    options: ['Rinse with running water for at least 15 minutes', 'Finish the room first', 'Apply another cleaning product', 'Wait to see if it hurts'],
    correctIndex: 0,
    source: 'B-ABNB-HR-002 · Chemical Safety',
  },
  {
    key: 'urgent_issue',
    prompt: 'What do you do for urgent damage, access failure, safety or guest-ready risk?',
    options: ['Call Brendan immediately on 0418 878 707', 'Wait until the job is finished', 'Contact the property host', 'Post it in a group chat only'],
    correctIndex: 0,
    source: 'B-ABNB-HR-001 / B-ABNB-HR-005',
  },
  {
    key: 'completion_evidence',
    prompt: 'What evidence is required before marking a job complete?',
    options: ['A photo of every room and all required checklist items', 'One photo of the front door', 'A text message only', 'No evidence if the clean ran on time'],
    correctIndex: 0,
    source: 'B-ABNB-HR-002 · Performance Expectations',
  },
  {
    key: 'job_response',
    prompt: 'How quickly must you accept or decline a job assignment?',
    options: ['Within 2 hours', 'Within 24 hours', 'At the property', 'Only if you can accept it'],
    correctIndex: 0,
    source: 'B-ABNB-HR-005 · Scheduling',
  },
  {
    key: 'late_arrival',
    prompt: 'What must happen if you expect to arrive more than 15 minutes late?',
    options: ['Notify the head cleaner before the scheduled start time', 'Say nothing if you make up the time', 'Contact the guest', 'Mark the job complete later'],
    correctIndex: 0,
    source: 'B-ABNB-HR-005 · Job Confirmation',
  },
  {
    key: 'privacy',
    prompt: 'Can property access codes or guest details be shared outside the Brightly team?',
    options: ['No, never', 'Only with friends helping on the clean', 'Only after checkout', 'Yes, if sent privately'],
    correctIndex: 0,
    source: 'B-ABNB-HR-002 / B-ABNB-HR-005',
  },
];

export const PRESTART_REQUIREMENTS = [
  { key: 'abn_provided', label: 'ABN provided and valid', owner: 'cleaner' },
  { key: 'bank_details_provided', label: 'Bank details provided', owner: 'cleaner' },
  { key: 'emergency_contact_provided', label: 'Emergency contact provided', owner: 'cleaner' },
  { key: 'id_uploaded', label: 'Photo ID uploaded', owner: 'cleaner' },
  { key: 'id_verified', label: 'Photo ID verified by Brightly', owner: 'admin' },
  { key: 'master_sop_signed', label: 'Master Housekeeping SOP acknowledged', owner: 'cleaner' },
  { key: 'linen_sop_signed', label: 'Linen & Laundry SOP acknowledged', owner: 'cleaner' },
  { key: 'consumables_sop_signed', label: 'Consumables SOP acknowledged', owner: 'cleaner' },
  { key: 'quick_reference_reviewed', label: 'Cleaner Quick Reference reviewed', owner: 'cleaner' },
  { key: 'chemical_induction_passed', label: 'Chemical safety induction passed', owner: 'cleaner' },
  { key: 'brightly_app_tested', label: 'Brightly login and test job completed', owner: 'admin' },
  { key: 'kit_issued', label: 'Kit and consumables issued', owner: 'admin' },
  { key: 'welcome_induction_completed', label: 'Welcome and contractor induction completed', owner: 'admin' },
  { key: 'verbal_knowledge_check_completed', label: 'Verbal knowledge check completed', owner: 'admin' },
  { key: 'shadow_clean_1_completed', label: 'Shadow Clean 1 completed and debriefed', owner: 'admin' },
  { key: 'shadow_clean_2_completed', label: 'Shadow Clean 2 completed', owner: 'admin' },
  { key: 'shadow_clean_2_qc_passed', label: 'Shadow Clean 2 QC score is 80%+', owner: 'admin' },
] as const;

export const DOCUMENT_TYPES = [
  { key: 'profile_photo', label: 'Profile photo', required: true },
  { key: 'photo_id', label: 'Photo ID', required: true },
  { key: 'public_liability', label: 'Public liability certificate', required: false },
] as const;

export type StaffOnboardingDraft = {
  full_name: string;
  preferred_name: string;
  phone: string;
  email: string;
  date_of_birth: string;
  address: string;
  residential_suburb: string;
  postcode: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  abn_status: string;
  abn: string;
  gst_registered: boolean;
  is_contractor: boolean;
  bank_account_name: string;
  bank_bsb: string;
  bank_account_number: string;
  id_document_type: string;
  id_confirmed: boolean;
  public_liability_status: string;
  public_liability_expiry: string;
  drivers_licence_expiry: string;
  transport_confirmed: boolean;
  vehicle_rego: string;
  available_days: string[];
  availability_notes: string;
  has_whatsapp: boolean;
  brightly_notifications_enabled: boolean;
  communication_acknowledged: boolean;
  sop_acknowledgements: Record<string, boolean>;
  knowledge_answers: Record<string, number>;
  declaration_accurate: boolean;
  declaration_compliance: boolean;
  digital_signature: string;
};

export const EMPTY_STAFF_ONBOARDING_DRAFT: StaffOnboardingDraft = {
  full_name: '',
  preferred_name: '',
  phone: '',
  email: '',
  date_of_birth: '',
  address: '',
  residential_suburb: '',
  postcode: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
  abn_status: '',
  abn: '',
  gst_registered: false,
  is_contractor: true,
  bank_account_name: '',
  bank_bsb: '',
  bank_account_number: '',
  id_document_type: '',
  id_confirmed: false,
  public_liability_status: '',
  public_liability_expiry: '',
  drivers_licence_expiry: '',
  transport_confirmed: false,
  vehicle_rego: '',
  available_days: [],
  availability_notes: '',
  has_whatsapp: false,
  brightly_notifications_enabled: false,
  communication_acknowledged: false,
  sop_acknowledgements: Object.fromEntries(ONBOARDING_ACKNOWLEDGEMENTS.map((item) => [item.key, false])),
  knowledge_answers: {},
  declaration_accurate: false,
  declaration_compliance: false,
  digital_signature: '',
};

export function normaliseDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function formatAustralianDateInput(value: string) {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const source = isoMatch ? `${isoMatch[3]}${isoMatch[2]}${isoMatch[1]}` : normaliseDigits(value);
  const digits = source.slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function isValidAustralianDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return false;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (year < 1900 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatStoredDateAustralian(value: unknown) {
  const text = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? formatAustralianDateInput(text) : text || '—';
}

export function isAcknowledgementAccepted(
  acknowledgements: Record<string, boolean | { acknowledged?: boolean }>,
  acknowledgement: OnboardingAcknowledgement,
) {
  const accepted = (key: string) => {
    const entry = acknowledgements[key];
    return entry === true || (typeof entry === 'object' && entry?.acknowledged === true);
  };
  return accepted(acknowledgement.key)
    || (acknowledgement.legacyKeys.length > 0 && acknowledgement.legacyKeys.every(accepted));
}

export function isValidAbn(value: string) {
  const digits = normaliseDigits(value).split('').map(Number);
  if (digits.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  digits[0] -= 1;
  return digits.reduce((sum, digit, index) => sum + digit * weights[index], 0) % 89 === 0;
}

export function getKnowledgeScore(answers: Record<string, number>) {
  return ONBOARDING_KNOWLEDGE_QUESTIONS.reduce(
    (score, question) => score + (answers[question.key] === question.correctIndex ? 1 : 0),
    0,
  );
}

export function isRequirementComplete(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && 'completed' in value) {
    return Boolean((value as { completed?: boolean }).completed);
  }
  return false;
}
