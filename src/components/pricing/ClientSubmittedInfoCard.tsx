import { Badge } from '@/components/ui/badge';

interface Props {
  formData: Record<string, any>;
  cleanType: string;
}

const AIRBNB_TYPES = ['airbnb', 'airbnb / short-stay turnover', 'airbnb turnover'];

export default function ClientSubmittedInfoCard({ formData, cleanType }: Props) {
  if (!formData || Object.keys(formData).length === 0) return null;

  const fd = formData;
  const isAirbnb = AIRBNB_TYPES.some(t => cleanType.toLowerCase().includes(t));
  const isDeep = cleanType.toLowerCase().includes('deep');
  const isCommercial = cleanType.toLowerCase().includes('commercial') || cleanType.toLowerCase().includes('office');

  const items: { label: string; value: string }[] = [];

  // Universal fields
  if (fd.access_method) items.push({ label: 'Access', value: fd.access_method });
  if (fd.access_instructions) items.push({ label: 'Access Instructions', value: fd.access_instructions });
  if (fd.parking) items.push({ label: 'Parking', value: fd.parking });
  if (fd.first_clean != null) items.push({ label: 'First Clean', value: fd.first_clean ? 'Yes' : 'No' });
  if (fd.pets != null) items.push({ label: 'Pets', value: fd.pets ? 'Yes' : 'No' });
  if (fd.frequency) items.push({ label: 'Frequency', value: fd.frequency });
  if (fd.preferred_days?.length) items.push({ label: 'Preferred Days', value: Array.isArray(fd.preferred_days) ? fd.preferred_days.join(', ') : fd.preferred_days });
  if (fd.preferred_time) items.push({ label: 'Preferred Time', value: fd.preferred_time });

  // Airbnb
  if (isAirbnb) {
    // Structural fields the client filled in — shown so the quoter sees the
    // full picture, not just access details. (Previously sofa_beds etc. were
    // captured in form_data but never displayed — Brendan flagged 2026-04-21.)
    if (fd.kitchens != null && Number(fd.kitchens) > 0) items.push({ label: 'Kitchens', value: String(fd.kitchens) });
    if (fd.living_areas != null && Number(fd.living_areas) > 0) items.push({ label: 'Living Areas', value: String(fd.living_areas) });
    if (fd.balconies != null && Number(fd.balconies) > 0) items.push({ label: 'Balconies', value: String(fd.balconies) });
    if (fd.sofa_beds != null && Number(fd.sofa_beds) > 0) items.push({ label: 'Sofa Beds', value: String(fd.sofa_beds) });
    if (fd.outdoor_areas === true) items.push({ label: 'Outdoor Areas', value: 'Yes' });
    if (fd.bed_config) items.push({ label: 'Bed Config', value: String(fd.bed_config) });

    if (fd.checkout_time) items.push({ label: 'Guest Checkout', value: fd.checkout_time });
    if (fd.checkin_time) items.push({ label: 'Next Check-in', value: fd.checkin_time });
    if (fd.platform) items.push({ label: 'Platform', value: fd.platform });
    if (fd.linen_change != null) items.push({ label: 'Linen Required', value: fd.linen_change ? 'Yes' : 'No' });
    if (fd.amenities_kit === true) items.push({ label: 'Amenities Kit', value: 'Yes' });
    if (fd.wash_kit === true) items.push({ label: 'Wash Kit', value: 'Yes' });
    if (fd.tea_coffee_kit === true) items.push({ label: 'Tea/Coffee Kit', value: 'Yes' });
    if (fd.hosting_notes) items.push({ label: 'Hosting Notes', value: fd.hosting_notes });
  }

  // Deep Clean
  if (isDeep) {
    if (fd.last_cleaned) items.push({ label: 'Last Cleaned', value: fd.last_cleaned });
    if (fd.property_condition) items.push({ label: 'Property Condition', value: fd.property_condition });
  }

  // Commercial
  if (isCommercial) {
    if (fd.business_name) items.push({ label: 'Business Name', value: fd.business_name });
    if (fd.abn) items.push({ label: 'ABN', value: fd.abn });
    if (fd.space_type) items.push({ label: 'Space Type', value: fd.space_type });
    if (fd.approx_size) items.push({ label: 'Approx Size', value: fd.approx_size });
    if (fd.floor_types) items.push({ label: 'Floor Types', value: Array.isArray(fd.floor_types) ? fd.floor_types.join(', ') : fd.floor_types });
    if (fd.after_hours != null) items.push({ label: 'After Hours', value: fd.after_hours ? 'Yes' : 'No' });
  }

  // Focus areas
  if (fd.focus_areas) {
    const areas = Array.isArray(fd.focus_areas) ? fd.focus_areas.join(', ') : fd.focus_areas;
    items.push({ label: 'Focus Areas', value: areas });
  }

  if (items.length === 0) return null;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-3 border border-primary/20">
      <h3 className="font-extrabold text-foreground flex items-center gap-2">
        📋 Client Submitted Info
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <Badge variant="secondary" className="text-xs shrink-0">{item.label}</Badge>
            <span className="text-sm text-foreground truncate">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
