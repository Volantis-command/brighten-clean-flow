export type SopDocument = {
  code: string;
  title: string;
  category: 'Cleaning' | 'Quality' | 'People';
  pdfUrl: string;
  acknowledgementKey: 'cleaning_guest_ready' | 'safety_incidents' | 'communication_conduct_training';
};

export const SOP_DOCUMENTS: SopDocument[] = [
  {
    code: 'B-ABNB-SOP-004',
    title: 'Housekeeping & Turnover SOP',
    category: 'Cleaning',
    pdfUrl: '/sops/B-ABNB-SOP-004.pdf',
    acknowledgementKey: 'cleaning_guest_ready',
  },
  {
    code: 'B-ABNB-SOP-005',
    title: 'Linen & Laundry Management SOP',
    category: 'Cleaning',
    pdfUrl: '/sops/B-ABNB-SOP-005.pdf',
    acknowledgementKey: 'cleaning_guest_ready',
  },
  {
    code: 'B-ABNB-SOP-006',
    title: 'Consumables & Amenity Restocking SOP',
    category: 'Cleaning',
    pdfUrl: '/sops/B-ABNB-SOP-006.pdf',
    acknowledgementKey: 'cleaning_guest_ready',
  },
  {
    code: 'B-ABNB-QC-001',
    title: 'Pre-Guest Arrival Inspection Checklist & SOP',
    category: 'Quality',
    pdfUrl: '/sops/B-ABNB-QC-001.pdf',
    acknowledgementKey: 'cleaning_guest_ready',
  },
  {
    code: 'B-ABNB-REF-001',
    title: 'Cleaner Quick Reference Form',
    category: 'Cleaning',
    pdfUrl: '/sops/B-ABNB-REF-001.pdf',
    acknowledgementKey: 'cleaning_guest_ready',
  },
  {
    code: 'B-ABNB-HR-002',
    title: 'Cleaner Onboarding & Training SOP',
    category: 'People',
    pdfUrl: '/sops/B-ABNB-HR-002.pdf',
    acknowledgementKey: 'safety_incidents',
  },
  {
    code: 'B-ABNB-HR-001',
    title: 'Staff Roles & Responsibilities Overview',
    category: 'People',
    pdfUrl: '/sops/B-ABNB-HR-001.pdf',
    acknowledgementKey: 'communication_conduct_training',
  },
  {
    code: 'B-ABNB-HR-005',
    title: 'Staff Communication & Scheduling SOP',
    category: 'People',
    pdfUrl: '/sops/B-ABNB-HR-005.pdf',
    acknowledgementKey: 'communication_conduct_training',
  },
];

export function getSopsForAcknowledgement(key: string) {
  return SOP_DOCUMENTS.filter((document) => document.acknowledgementKey === key);
}
