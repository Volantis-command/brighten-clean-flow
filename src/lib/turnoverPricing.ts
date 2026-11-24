import { calculateLinenCost, type BedType } from './pricingCalculator';
import { SERVICE_TYPES } from './serviceTypes';

/**
 * Turnover pricing model, reverse engineered from the Kingscliff and Coastal
 * portfolios on 25 Nov 2026.
 *
 *   price (inc GST) = hours x $82.50
 *                   + linen item cost x 1.05   (only when we supply linen)
 *                   + consumable kits, photo report, travel, adjustments
 *
 *   hours = 0.5 base + 0.5 per bedroom + 0.25 per bathroom
 *         + 0.75 balcony/terrace/yard + 0.25 if it is a house + extras
 *
 * The hourly rate, base, bedroom, bathroom, outdoor, house and linen markup
 * come straight out of the data: they reproduce all 7 Coastal prices within $2
 * and Magnolia and Ohana exactly. The other extras (living areas, levels,
 * bunks, sofa beds, toilets, granny flat, pool) never varied in the data, so
 * their defaults are judgement calls. Every number is editable on the page.
 */

export interface ModelSettings {
  rateInc: number;
  baseHours: number;
  perBedroom: number;
  perBathroom: number;
  outdoor: number;
  house: number;
  pool: number;
  extraLiving: number;
  extraLevel: number;
  perBunk: number;
  perSofa: number;
  extraToilet: number;
  grannyFlat: number;
  linenMarkupPct: number;
  cleanerPayRate: number;
  hoursRounding: number;
}

export const SETTING_DEFS: {
  field: keyof ModelSettings;
  key: string;
  label: string;
  unit: 'inc' | 'h' | '%' | '$/h';
  fromData: boolean;
  fallback: number;
}[] = [
  { field: 'rateInc', key: 'qb_rate_inc', label: 'Hourly rate', unit: 'inc', fromData: true, fallback: 82.5 },
  { field: 'baseHours', key: 'qb_base_hours', label: 'Base time every clean', unit: 'h', fromData: true, fallback: 0.5 },
  { field: 'perBedroom', key: 'qb_hours_per_bedroom', label: 'Per bedroom', unit: 'h', fromData: true, fallback: 0.5 },
  { field: 'perBathroom', key: 'qb_hours_per_bathroom', label: 'Per bathroom', unit: 'h', fromData: true, fallback: 0.25 },
  { field: 'outdoor', key: 'qb_hours_outdoor', label: 'Balcony, terrace or yard', unit: 'h', fromData: true, fallback: 0.75 },
  { field: 'house', key: 'qb_hours_house', label: 'House (not an apartment)', unit: 'h', fromData: true, fallback: 0.25 },
  { field: 'linenMarkupPct', key: 'qb_linen_markup_pct', label: 'Linen markup on item cost', unit: '%', fromData: true, fallback: 5 },
  { field: 'pool', key: 'qb_hours_pool', label: 'Pool or spa', unit: 'h', fromData: false, fallback: 0 },
  { field: 'extraLiving', key: 'qb_hours_extra_living', label: 'Each living area after the first', unit: 'h', fromData: false, fallback: 0.25 },
  { field: 'extraLevel', key: 'qb_hours_extra_level', label: 'Each level after the first', unit: 'h', fromData: false, fallback: 0.25 },
  { field: 'perBunk', key: 'qb_hours_per_bunk', label: 'Per bunk bed', unit: 'h', fromData: false, fallback: 0.25 },
  { field: 'perSofa', key: 'qb_hours_per_sofa', label: 'Per sofa bed made up', unit: 'h', fromData: false, fallback: 0.25 },
  { field: 'extraToilet', key: 'qb_hours_extra_toilet', label: 'Each separate toilet', unit: 'h', fromData: false, fallback: 0.1 },
  { field: 'grannyFlat', key: 'qb_hours_granny_flat', label: 'Granny flat or studio', unit: 'h', fromData: false, fallback: 1 },
  { field: 'hoursRounding', key: 'qb_hours_rounding', label: 'Round hours to nearest', unit: 'h', fromData: false, fallback: 0.25 },
  { field: 'cleanerPayRate', key: 'qb_cleaner_pay_rate', label: 'Cleaner pay', unit: '$/h', fromData: false, fallback: 37 },
];

export function settingsFrom(map: Record<string, number> | undefined): ModelSettings {
  const out = {} as ModelSettings;
  for (const d of SETTING_DEFS) {
    const v = map?.[d.key];
    out[d.field] = v != null && Number.isFinite(Number(v)) ? Number(v) : d.fallback;
  }
  return out;
}

export interface Beds {
  king: number;
  queen: number;
  double: number;
  kingSingle: number;
  single: number;
  bunk: number;
  sofa: number;
}

export const BED_LABELS: { field: keyof Beds; label: string }[] = [
  { field: 'king', label: 'King' },
  { field: 'queen', label: 'Queen' },
  { field: 'double', label: 'Double' },
  { field: 'kingSingle', label: 'King single' },
  { field: 'single', label: 'Single' },
  { field: 'bunk', label: 'Bunk (2 beds)' },
  { field: 'sofa', label: 'Sofa bed' },
];

export const NO_BEDS: Beds = { king: 0, queen: 0, double: 0, kingSingle: 0, single: 0, bunk: 0, sofa: 0 };

export interface QuoteInput {
  propertyType: 'apartment' | 'house';
  bedrooms: number;
  bathrooms: number;
  separateToilets: number;
  livingAreas: number;
  levels: number;
  kitchens: number;
  beds: Beds;
  outdoor: boolean;
  pool: boolean;
  grannyFlat: boolean;
  weSupplyLinen: boolean;
  amenitiesKit: boolean;
  teaCoffeeKit: boolean;
  washKit: boolean;
  photoReport: boolean;
  travelFee: number;
  adjustment: number;
  hoursOverride: number | null;
  priceOverride: number | null;
}

export const BLANK_INPUT: QuoteInput = {
  propertyType: 'house',
  bedrooms: 3,
  bathrooms: 2,
  separateToilets: 0,
  livingAreas: 1,
  levels: 1,
  kitchens: 1,
  beds: { ...NO_BEDS, king: 1, queen: 2 },
  outdoor: true,
  pool: false,
  grannyFlat: false,
  weSupplyLinen: true,
  amenitiesKit: false,
  teaCoffeeKit: false,
  washKit: false,
  photoReport: false,
  travelFee: 0,
  adjustment: 0,
  hoursOverride: null,
  priceOverride: null,
};

export interface HourLine { label: string; hours: number }

export interface QuoteResult {
  hourLines: HourLine[];
  formulaHours: number;
  hours: number;
  labour: number;
  linen: number;
  linenItemCost: number;
  consumables: number;
  photo: number;
  travel: number;
  adjustment: number;
  formulaTotal: number;
  totalInc: number;
  totalEx: number;
  gst: number;
  withoutLinenInc: number;
  withLinenInc: number;
  perHourInc: number;
  cleanerCost: number;
  grossProfitEx: number;
  grossMarginPct: number;
  bedCount: number;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

export function roundHours(h: number, step: number) {
  if (!step || step <= 0) return round2(h);
  // Nudge by a hair so 4.125 rounds to 4.25, not down by float error.
  return round2(Math.round((h + 1e-9) / step) * step);
}

/** Linen beds in the shape calculateLinenCost understands. Bunks are two singles. */
export function linenBedTypes(beds: Beds): BedType[] {
  const out: BedType[] = [];
  const push = (t: BedType, count: number) => { for (let i = 0; i < count; i++) out.push(t); };
  push('King', n(beds.king));
  push('Queen', n(beds.queen) + n(beds.double));
  push('King Single', n(beds.kingSingle) + 2 * n(beds.bunk));
  push('Single', n(beds.single));
  return out;
}

export function bedCount(beds: Beds) {
  return n(beds.king) + n(beds.queen) + n(beds.double) + n(beds.kingSingle) + n(beds.single) + 2 * n(beds.bunk) + n(beds.sofa);
}

export function quote(input: QuoteInput, s: ModelSettings, rates: Record<string, number> = {}): QuoteResult {
  const lines: HourLine[] = [];
  const add = (label: string, hours: number) => { if (hours) lines.push({ label, hours: round2(hours) }); };

  add('Base', s.baseHours);
  add(`${n(input.bedrooms)} bedroom${n(input.bedrooms) === 1 ? '' : 's'}`, n(input.bedrooms) * s.perBedroom);
  add(`${n(input.bathrooms)} bathroom${n(input.bathrooms) === 1 ? '' : 's'}`, n(input.bathrooms) * s.perBathroom);
  if (n(input.separateToilets)) add(`${n(input.separateToilets)} separate toilet${n(input.separateToilets) === 1 ? '' : 's'}`, n(input.separateToilets) * s.extraToilet);
  if (input.propertyType === 'house') add('House', s.house);
  if (input.outdoor) add('Balcony, terrace or yard', s.outdoor);
  if (input.pool) add('Pool or spa', s.pool);
  if (n(input.livingAreas) > 1) add(`${n(input.livingAreas) - 1} extra living area${n(input.livingAreas) - 1 === 1 ? '' : 's'}`, (n(input.livingAreas) - 1) * s.extraLiving);
  if (n(input.levels) > 1) add(`${n(input.levels) - 1} extra level${n(input.levels) - 1 === 1 ? '' : 's'}`, (n(input.levels) - 1) * s.extraLevel);
  if (n(input.beds.bunk)) add(`${n(input.beds.bunk)} bunk bed${n(input.beds.bunk) === 1 ? '' : 's'}`, n(input.beds.bunk) * s.perBunk);
  if (n(input.beds.sofa)) add(`${n(input.beds.sofa)} sofa bed${n(input.beds.sofa) === 1 ? '' : 's'}`, n(input.beds.sofa) * s.perSofa);
  if (input.grannyFlat) add('Granny flat or studio', s.grannyFlat);

  const raw = lines.reduce((a, l) => a + l.hours, 0);
  const formulaHours = roundHours(raw, s.hoursRounding);
  const hours = input.hoursOverride != null && input.hoursOverride > 0 ? input.hoursOverride : formulaHours;

  const labour = round2(hours * s.rateInc);
  const linenItemCost = round2(calculateLinenCost(
    linenBedTypes(input.beds),
    n(input.beds.sofa),
    n(input.bathrooms),
    Math.max(n(input.kitchens), 0),
    n(input.separateToilets),
    SERVICE_TYPES.AIRBNB_TURNOVER,
    rates,
  ));
  const linenCharge = round2(linenItemCost * (1 + s.linenMarkupPct / 100));
  const linen = input.weSupplyLinen ? linenCharge : 0;
  const consumables = round2(
    (input.amenitiesKit ? n(rates.consumable_amenities_kit ?? 6.5) : 0)
    + (input.teaCoffeeKit ? n(rates.consumable_tea_coffee_kit ?? 6.5) : 0)
    + (input.washKit ? n(rates.consumable_wash_kit ?? 7.5) : 0),
  );
  const photo = input.photoReport ? n(rates.photo_reporting_fee ?? 20) : 0;
  const travel = n(input.travelFee);
  const adjustment = n(input.adjustment);

  const extras = consumables + photo + travel + adjustment;
  const formulaTotal = round2(labour + linen + extras);
  const totalInc = input.priceOverride != null && input.priceOverride > 0 ? input.priceOverride : formulaTotal;
  const totalEx = round2(totalInc / 1.1);
  const gst = round2(totalInc - totalEx);

  const cleanerCost = round2(hours * s.cleanerPayRate);
  const linenCostEx = input.weSupplyLinen ? linenItemCost : 0;
  const consumablesEx = consumables / 1.1;
  const grossProfitEx = round2(totalEx - cleanerCost - linenCostEx - consumablesEx);

  return {
    hourLines: lines,
    formulaHours,
    hours,
    labour,
    linen,
    linenItemCost,
    consumables,
    photo,
    travel,
    adjustment,
    formulaTotal,
    totalInc,
    totalEx,
    gst,
    withoutLinenInc: round2(labour + extras),
    withLinenInc: round2(labour + linenCharge + extras),
    perHourInc: hours > 0 ? round2(totalInc / hours) : 0,
    cleanerCost,
    grossProfitEx,
    grossMarginPct: totalEx > 0 ? Math.round((grossProfitEx / totalEx) * 1000) / 10 : 0,
    bedCount: bedCount(input.beds),
  };
}

// ---------------------------------------------------------------------------
// Reading an existing property record into the form
// ---------------------------------------------------------------------------

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function addBedPhrase(beds: Beds, phrase: string) {
  const p = phrase.toLowerCase().replace(/bedroom\s*\d+\s*:/g, '').trim();
  if (!p) return;
  const m = p.match(/^(\d+|one|two|three|four|five|six)\b/);
  const count = m ? (WORD_NUM[m[1]] ?? Number(m[1])) : 1;
  if (/bunk/.test(p)) beds.bunk += count;
  else if (/sofa/.test(p)) beds.sofa += count;
  else if (/king\s*single/.test(p)) beds.kingSingle += count;
  else if (/king/.test(p)) beds.king += count;
  else if (/queen/.test(p)) beds.queen += count;
  else if (/double/.test(p)) beds.double += count;
  else if (/single/.test(p)) beds.single += count;
}

/**
 * Beds from a property row. bed_config text wins over bed_types because it is
 * what the client gave us ("1 King Bed, 2 Single Beds"); bed_types is the
 * per-room picker and was often left on its defaults.
 */
export function parseBeds(bedConfig?: string | null, bedTypes?: unknown): Beds {
  const beds: Beds = { ...NO_BEDS };
  if (bedConfig && bedConfig.trim()) {
    bedConfig.split(/[,;\n]+/).forEach((part) => addBedPhrase(beds, part));
    if (bedCount(beds) > 0) return beds;
  }
  if (bedTypes && typeof bedTypes === 'object') {
    Object.values(bedTypes as Record<string, unknown>).forEach((v) => {
      if (typeof v === 'string') addBedPhrase(beds, v);
    });
  }
  return beds;
}

export interface PropertyRow {
  id: string;
  property_name: string | null;
  client_name: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  toilets: number | null;
  living_areas: number | null;
  kitchens: number | null;
  balconies: number | null;
  sofa_beds: number | null;
  max_guests: number | null;
  has_pool: boolean | null;
  has_outdoor_area: boolean | null;
  bed_config: string | null;
  bed_types: unknown;
  estimated_hours: number | string | null;
  default_price: number | string | null;
  price_turnover: number | string | null;
  price_includes_gst: boolean | null;
  amenities_kit: boolean | null;
  tea_coffee_kit: boolean | null;
  wash_kit: boolean | null;
}

/** What the property is charged now, inc GST. */
export function currentPriceInc(p: PropertyRow): number | null {
  if (p.default_price != null && Number(p.default_price) > 0) {
    const v = Number(p.default_price);
    return p.price_includes_gst === false ? round2(v * 1.1) : v;
  }
  if (p.price_turnover != null && Number(p.price_turnover) > 0) return Number(p.price_turnover);
  return null;
}

export function inputFromProperty(p: PropertyRow, weSupplyLinen: boolean): QuoteInput {
  const beds = parseBeds(p.bed_config, p.bed_types);
  if (!beds.sofa && n(p.sofa_beds)) beds.sofa = n(p.sofa_beds);
  const bathrooms = n(p.bathrooms);
  return {
    ...BLANK_INPUT,
    propertyType: /apartment|unit|flat/i.test(p.property_type || '') ? 'apartment' : 'house',
    bedrooms: n(p.bedrooms),
    bathrooms,
    // toilets is filled in two ways across the portfolio (total, or separate
    // only). Only count what is beyond the bathrooms.
    separateToilets: Math.max(0, n(p.toilets) - bathrooms),
    livingAreas: n(p.living_areas) || 1,
    levels: 1,
    kitchens: n(p.kitchens) || 1,
    beds,
    outdoor: !!p.has_outdoor_area || n(p.balconies) > 0,
    pool: !!p.has_pool,
    grannyFlat: false,
    weSupplyLinen,
    amenitiesKit: !!p.amenities_kit,
    teaCoffeeKit: !!p.tea_coffee_kit,
    washKit: !!p.wash_kit,
  };
}

// ---------------------------------------------------------------------------
// Filling the form from a listing (extract-listing edge function)
// ---------------------------------------------------------------------------

export interface ListingFields {
  property_name: string | null;
  address: string | null;
  property_type: 'apartment' | 'house';
  bedrooms: number;
  bathrooms: number;
  separate_toilets: number;
  living_areas: number;
  levels: number;
  kitchens: number;
  beds: { king: number; queen: number; double: number; king_single: number; single: number; bunk: number; sofa: number };
  outdoor: boolean;
  pool: boolean;
  granny_flat: boolean;
  sleeps: number | null;
  notes: string;
  unsure: string[];
}

const nn = (v: unknown, min = 0) => Math.max(min, Math.round(Number.isFinite(Number(v)) ? Number(v) : 0));

/** Overwrite the property facts; keep linen, kits, travel and overrides as they were. */
export function applyListing(prev: QuoteInput, l: ListingFields): QuoteInput {
  const b = l.beds ?? ({} as ListingFields['beds']);
  return {
    ...prev,
    propertyType: l.property_type === 'apartment' ? 'apartment' : 'house',
    bedrooms: nn(l.bedrooms),
    bathrooms: nn(l.bathrooms),
    separateToilets: nn(l.separate_toilets),
    livingAreas: nn(l.living_areas, 1),
    levels: nn(l.levels, 1),
    kitchens: nn(l.kitchens, 1),
    beds: {
      king: nn(b.king), queen: nn(b.queen), double: nn(b.double), kingSingle: nn(b.king_single),
      single: nn(b.single), bunk: nn(b.bunk), sofa: nn(b.sofa),
    },
    outdoor: !!l.outdoor,
    pool: !!l.pool,
    grannyFlat: !!l.granny_flat,
    hoursOverride: null,
    priceOverride: null,
  };
}
