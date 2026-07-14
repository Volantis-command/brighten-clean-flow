export const STAFF_ONBOARDING_VERSION = 'B-ABNB-HR-002-v1.0';

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
};

export const ONBOARDING_ACKNOWLEDGEMENTS: OnboardingAcknowledgement[] = [
  {
    key: 'engagement',
    title: 'Independent contractor engagement',
    source: 'B-ABNB-HR-002 · Your Engagement',
    summary: 'Work is offered as available with no guaranteed hours. Payment is per job or an agreed hourly rate. Contractors manage their own tax and GST obligations and must hold a valid ABN.',
    declaration: 'I understand and accept Brightly’s independent contractor engagement terms.',
  },
  {
    key: 'master_housekeeping',
    title: 'Master Housekeeping SOP',
    source: 'B-ABNB-SOP-004',
    summary: 'Follow the full sequence: arrival and vacancy check, strip, kitchen, bathrooms, bedrooms, living areas, final inspection, room photos, lock-up and completion in Brightly.',
    declaration: 'I have read and understood the Master Housekeeping SOP (B-ABNB-SOP-004).',
  },
  {
    key: 'linen_laundry',
    title: 'Linen & Laundry SOP',
    source: 'B-ABNB-SOP-005',
    summary: 'Use the rented-linen process. Bag used linen, tag and report damaged items, never discard hire linen, never reuse unchecked linen, and call the office before starting if fresh linen has not arrived.',
    declaration: 'I have read and understood the Linen & Laundry SOP (B-ABNB-SOP-005).',
  },
  {
    key: 'consumables',
    title: 'Consumables & Amenity Restocking SOP',
    source: 'B-ABNB-SOP-006',
    summary: 'Restock every property to its documented standard and report missing or insufficient supplies before the property is guest-ready.',
    declaration: 'I have read and understood the Consumables & Amenity Restocking SOP (B-ABNB-SOP-006).',
  },
  {
    key: 'pre_guest_inspection',
    title: 'Pre-Guest Arrival Inspection',
    source: 'B-ABNB-QC-001',
    summary: 'Complete the final guest-ready inspection, confirm every room and presentation standard, photograph every room and report anything that may affect the incoming guest.',
    declaration: 'I have read and understood the Pre-Guest Arrival Inspection Checklist (B-ABNB-QC-001).',
  },
  {
    key: 'quick_reference',
    title: 'Cleaner Quick Reference',
    source: 'B-ABNB-REF-001',
    summary: 'Use the quick reference as an on-job reminder, while the full SOPs remain the controlling standard.',
    declaration: 'I have received and reviewed the Cleaner Quick Reference (B-ABNB-REF-001).',
  },
  {
    key: 'cleaning_standards',
    title: 'Hotel-standard cleaning and presentation',
    source: 'B-ABNB-HR-002 · Training — Cleaning Standards',
    summary: 'Beds must be symmetrical and wrinkle-free; bathrooms sanitised and hair-free; kitchens clean and dry; consumables restocked; products hidden; windows and doors secured; every room photographed.',
    declaration: 'I understand Brightly’s non-negotiable cleaning and presentation standards.',
  },
  {
    key: 'chemical_safety',
    title: 'Chemical safety and PPE',
    source: 'B-ABNB-HR-002 · WHS',
    summary: 'Never mix chemicals. Keep products in labelled containers. Wear rubber gloves for chemicals, bathrooms and kitchens; use safety glasses for overhead or confined spraying; wear closed-toe slip-resistant footwear.',
    declaration: 'I understand and will follow Brightly’s chemical safety and PPE requirements.',
  },
  {
    key: 'incident_reporting',
    title: 'Incident, injury and spill response',
    source: 'B-ABNB-HR-002 · WHS',
    summary: 'Call 000 for life-threatening events, notify Brendan immediately, complete an incident report within 24 hours, isolate and ventilate spills, and rinse chemical exposure with running water for at least 15 minutes.',
    declaration: 'I understand the incident, injury, chemical exposure and spill-response process.',
  },
  {
    key: 'communication_scheduling',
    title: 'Communication and scheduling',
    source: 'B-ABNB-HR-005',
    summary: 'Brightly is the system of record for jobs, checklists, time and photos. Accept or decline assignments within 2 hours. Call for schedule changes within 24 hours and urgent damage, access or safety issues.',
    declaration: 'I understand Brightly’s job acceptance, attendance and urgent communication requirements.',
  },
  {
    key: 'privacy_confidentiality',
    title: 'Privacy, access and confidentiality',
    source: 'B-ABNB-HR-001 / B-ABNB-HR-002 / B-ABNB-HR-005',
    summary: 'Never share access codes, entry details, guest information, client contacts or Brightly pricing. Do not contact a host unless specifically instructed.',
    declaration: 'I will protect all guest, client, property and Brightly information.',
  },
  {
    key: 'conduct_performance',
    title: 'Conduct and performance',
    source: 'B-ABNB-HR-002 · Performance Expectations',
    summary: 'Arrive on time, complete every checklist item, submit required photos, behave professionally, do not smoke or eat at properties, avoid personal calls and respect all guest belongings.',
    declaration: 'I understand the conduct and performance standards and the breaches that may result in removal from Brightly.',
  },
  {
    key: 'shadow_cleans',
    title: 'Shadow cleans and solo deployment',
    source: 'B-ABNB-HR-002 · Shadow Clean Procedure',
    summary: 'Complete at least two supervised shadow cleans. Shadow Clean 2 requires a QC score of 80% or higher. Additional training may be required and only the Director can approve solo deployment.',
    declaration: 'I understand the shadow-clean, QC and Director approval requirements before solo work.',
  },
  {
    key: 'ongoing_training',
    title: 'Ongoing training triggers',
    source: 'B-ABNB-HR-002 · Ongoing Training Triggers',
    summary: 'Retraining may follow low QC scores, guest complaints, WHS events, process changes, new property types or 30+ days off roster. Current SOPs must be re-acknowledged annually.',
    declaration: 'I understand that training and SOP acknowledgement continue after initial deployment.',
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
  { key: 'police_check_received', label: 'Police check received', owner: 'cleaner' },
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
  { key: 'police_check', label: 'Police check', required: true },
  { key: 'public_liability', label: 'Public liability certificate', required: false },
  { key: 'work_rights', label: 'VEVO / work-rights evidence', required: false },
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
  police_check_date: string;
  public_liability_status: string;
  public_liability_expiry: string;
  work_rights_status: string;
  drivers_licence_expiry: string;
  transport_confirmed: boolean;
  vehicle_rego: string;
  available_days: string[];
  preferred_start_time: string;
  max_jobs_per_day: string;
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
  police_check_date: '',
  public_liability_status: '',
  public_liability_expiry: '',
  work_rights_status: 'citizen_or_pr',
  drivers_licence_expiry: '',
  transport_confirmed: false,
  vehicle_rego: '',
  available_days: [],
  preferred_start_time: '',
  max_jobs_per_day: '',
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
