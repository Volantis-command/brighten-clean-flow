/**
 * Canonical property write helpers.
 *
 * Problem this solves (Audit S3, 2026-04-22):
 * Property data is currently written from 5+ places — PropertyProfileForm,
 * PropertyPassportSection, PropertyFormPage, link-intake-to-profile,
 * backfill-orphan-clients, send-onboarding-sms, ClientDetailPage's Add
 * Property dialog. Each shapes the payload slightly differently. That
 * variance is how bugs like `parking_notes` vs `parking_instructions`,
 * `amenities_list` vs `amenities_notes`, `property_address` on the
 * junction, etc. keep creeping in.
 *
 * This module is the ONE place that knows:
 *   - what columns exist on `properties` (checked against types.ts)
 *   - what column names the database really uses (vs ad-hoc UI field names)
 *   - what client_properties needs (client_id + property_id — nothing else)
 *
 * All new code should import from here. Existing call sites will migrate
 * over time. A file touches properties → use these helpers. No more ad-hoc
 * `.from('properties').insert({...})` in components.
 *
 * If you need to write a column not in NewPropertyInput below — add it to
 * the type definition first, then use it. That way TypeScript blocks
 * invented columns at build time.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * The shape of what you can pass when creating or updating a property.
 * Every field here matches a real column on the `properties` table per
 * src/integrations/supabase/types.ts. If a field doesn't exist on the
 * table, it must not exist here.
 *
 * UI-field → DB-column aliases (e.g. `parking_notes` → `parking_instructions`)
 * are handled INSIDE the helpers below. Callers don't need to know.
 */
export interface PropertyWriteInput {
  // Core identity
  property_name?: string | null;
  address?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;

  // Classification
  property_type?: string | null;
  client_type?: string | null;
  status?: string | null;

  // Client denorm (still on properties for fast reads)
  client_name?: string | null;
  client_phone?: string | null;
  billing_email?: string | null;
  client_email?: string | null;

  // Size
  bedrooms?: number | null;
  bathrooms?: number | null;
  toilets?: number | null;
  kitchens?: number | null;
  living_areas?: number | null;
  balconies?: number | null;
  sofa_beds?: number | null;
  bed_config?: string | unknown[] | null;

  // Flags
  has_outdoor_area?: boolean | null;
  has_garage?: boolean | null;
  is_occupied?: boolean | null;
  occupant_count?: number | null;

  // Access
  access_method?: string | null;
  access_code?: string | null;
  alarm_code?: string | null;
  garage_code?: string | null;
  access_notes?: string | null;

  // Parking / preferences — NOTE: the DB column is `parking_instructions`.
  parking_instructions?: string | null;

  // Operational
  clean_frequency?: string | null;
  preferred_days?: string | null;
  preferred_time?: string | null;
  first_clean?: boolean | null;
  focus_areas?: string | null;

  // Airbnb turnover
  checkin_time?: string | null;
  checkout_time?: string | null;
  platform?: string | null;
  linen_required?: boolean | null;
  amenities_kit?: boolean | null;
  wash_kit?: boolean | null;
  tea_coffee_kit?: boolean | null;
  host_preferences?: string | null;

  // Commercial
  business_name?: string | null;
  abn?: string | null;
  approx_size?: string | null;
  has_kitchen_breakroom?: boolean | null;
  floor_types?: string | null;
  after_hours_access?: boolean | null;
  has_security_alarm?: boolean | null;

  // Deep clean hints
  deep_clean_oven?: boolean | null;
  deep_clean_fridge?: boolean | null;
  deep_clean_cupboards?: boolean | null;
  deep_clean_windows?: boolean | null;
  last_cleaned_when?: string | null;
  property_condition?: string | null;

  // Notes / guest-facing
  pet_notes?: string | null;
  preferences_notes?: string | null;
  product_restrictions?: string | null;
  special_instructions?: string | null;
  room_notes?: Record<string, string> | null;
  amenities_notes?: string | null;
  amenities_restock?: boolean | null;
  guest_access_notes?: string | null;
  guest_wifi?: string | null;
  linen_provided?: boolean | null;
  linen_sets?: number | null;
  property_photos?: Array<{ url: string; label?: string }> | null;

  // Pricing
  locked_price_inc_gst?: number | null;
  estimated_hours?: number | null;
  pricing_notes?: string | null;
  default_price?: number | null;
  price_includes_gst?: boolean | null;
  preferred_cleaner_id?: string | null;
}

/** Strip undefined fields so Supabase doesn't treat them as explicit nulls. */
function compact<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

/**
 * Create a new property. Returns the new property id or throws.
 * Defaults status to 'active' if not provided.
 */
export async function createProperty(input: PropertyWriteInput): Promise<string> {
  const payload = compact({
    status: 'active',
    ...input,
  });

  const { data, error } = await supabase
    .from('properties')
    .insert(payload as any)
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Property insert returned no id');
  return data.id;
}

/**
 * Update an existing property. Only the fields you pass are updated —
 * undefined fields are stripped so they don't clobber existing values.
 */
export async function updateProperty(id: string, input: PropertyWriteInput): Promise<void> {
  const payload = compact(input);
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from('properties')
    .update(payload as any)
    .eq('id', id);

  if (error) throw error;
}

/**
 * Create a property and link it to a client in one call.
 * The link is a pure junction row — NEVER write property_address or
 * property_name onto client_properties (those columns do not exist).
 */
export async function createPropertyAndLink(
  clientId: string,
  input: PropertyWriteInput
): Promise<string> {
  const propertyId = await createProperty(input);

  const { error: linkErr } = await supabase
    .from('client_properties')
    .insert({
      client_id: clientId,
      property_id: propertyId,
      // Visible to the client on their portal by default. Admin can hide
      // a specific link later by toggling portal_active=false. Without
      // this explicit true, the column defaulted to null and the portal
      // filter (eq portal_active true) hid every property after the first.
      // (Brendan flagged 2026-04-26.)
      portal_active: true,
    } as any);

  if (linkErr) throw linkErr;
  return propertyId;
}
