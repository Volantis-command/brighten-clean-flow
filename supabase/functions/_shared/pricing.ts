// ── Shared pricing engine (server-side) ──
// Ported VERBATIM from src/lib/pricingCalculator.ts + src/lib/serviceTypes.ts so
// the public instant-quote returns the EXACT same number the admin calculator
// would produce. Keep this file in sync if the admin engine changes.
//
// Why server-side: pricing_settings contains cost basis + GP margins. This runs
// in an edge function (service role) and returns ONLY sell prices — margins never
// reach the browser.

export const SERVICE_TYPES = {
  STANDARD_CLEAN: 'Standard Clean',
  DEEP_CLEAN: 'Deep Clean',
  BOND_END_OF_LEASE: 'Bond / End of Lease Clean',
  AIRBNB_TURNOVER: 'Airbnb / Short-Stay Turnover',
  POST_RENOVATION: 'Post-Renovation Clean',
  OFFICE_COMMERCIAL: 'Office / Commercial Clean',
} as const;

export type BedType = 'King' | 'Queen' | 'King Single' | 'Single';

export const PHOTO_REPORTING_FEE = 20; // $20 + GST per clean (optional)

export const CONSUMABLE_KITS = [
  { key: 'amenities_kit', price: 6.5 },
  { key: 'wash_kit', price: 7.5 },
  { key: 'tea_coffee_kit', price: 6.5 },
] as const;

const DEFAULT_HOURS: Record<string, number> = {
  [SERVICE_TYPES.STANDARD_CLEAN]: 2,
  [SERVICE_TYPES.DEEP_CLEAN]: 6,
  [SERVICE_TYPES.BOND_END_OF_LEASE]: 8,
  [SERVICE_TYPES.AIRBNB_TURNOVER]: 3,
  [SERVICE_TYPES.POST_RENOVATION]: 7,
  [SERVICE_TYPES.OFFICE_COMMERCIAL]: 3,
};

/** Stepped hour estimate from bedrooms/bathrooms. Mirrors serviceTypes.calculateDefaultHours. */
export function calculateDefaultHours(cleanType: string, bedrooms: number, bathrooms: number): number {
  if (cleanType === SERVICE_TYPES.POST_RENOVATION || cleanType === SERVICE_TYPES.OFFICE_COMMERCIAL) {
    return DEFAULT_HOURS[cleanType] || 3;
  }
  let hours = 1.5;
  for (let i = 1; i <= bedrooms; i++) hours += i <= 2 ? 0.25 : 0.5;
  for (let i = 1; i <= bathrooms; i++) hours += i <= 2 ? 0.25 : 0.5;
  hours = Math.max(hours, 2);
  if (cleanType === SERVICE_TYPES.DEEP_CLEAN) hours *= 1.5;
  return hours;
}

export type ConsumableSelection = {
  amenities_kit: boolean;
  wash_kit: boolean;
  tea_coffee_kit: boolean;
};

export type CalcInput = {
  cleanType: string;
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  sofaBeds: number;
  hours: number;
  bedTypes: BedType[];
  deepCleanMultiplier: number;
  specialistChemicals: number;
  gpOverride: number | null;
  discountGp: number | null;
  consumables?: ConsumableSelection;
  includePhotoReport?: boolean;
  linenRequired?: boolean;
  distanceKm: number;
  activePropertyCount: number;
  extraToilets: number;
};

type Rates = Record<string, number>;

const SERVICE_RATE_KEYS: Record<string, string> = {
  [SERVICE_TYPES.STANDARD_CLEAN]: 'rate_standard_clean',
  [SERVICE_TYPES.DEEP_CLEAN]: 'rate_deep_clean',
  [SERVICE_TYPES.BOND_END_OF_LEASE]: 'rate_bond_clean',
  [SERVICE_TYPES.AIRBNB_TURNOVER]: 'rate_airbnb_turnover',
  [SERVICE_TYPES.POST_RENOVATION]: 'rate_post_renovation',
  [SERVICE_TYPES.OFFICE_COMMERCIAL]: 'rate_office_commercial',
};

function getHourlyRateIncGst(cleanType: string, rates: Rates): number {
  const key = SERVICE_RATE_KEYS[cleanType];
  if (key && rates[key] != null) return rates[key];
  return rates['cleaner_hourly_rate'] || 70;
}

function sheetRateKey(bt: BedType): string {
  switch (bt) {
    case 'King': return 'linen_king_flat_sheet';
    case 'Queen': return 'linen_queen_flat_sheet';
    case 'King Single':
    case 'Single': return 'linen_king_single_flat_sheet';
  }
}

const NO_LINEN_TYPES = new Set<string>([
  SERVICE_TYPES.STANDARD_CLEAN,
  SERVICE_TYPES.DEEP_CLEAN,
  SERVICE_TYPES.BOND_END_OF_LEASE,
]);

function calculateConsumablesCostIncGst(consumables?: ConsumableSelection): number {
  if (!consumables) return 0;
  let cost = 0;
  for (const kit of CONSUMABLE_KITS) {
    if (consumables[kit.key as keyof ConsumableSelection] === true) cost += kit.price;
  }
  return cost;
}

function calculateLinenCost(
  bedTypes: BedType[], sofaBeds: number, bathrooms: number, kitchens: number,
  extraToilets: number, cleanType: string, rates: Rates,
): number {
  let cost = 0;
  for (const bt of bedTypes) {
    const sheetRate = rates[sheetRateKey(bt)] || 0;
    cost += 3 * sheetRate;
    cost += 4 * (rates.linen_pillowcase || 0);
    cost += 2 * (rates.linen_bath_towel || 0);
    cost += 2 * (rates.linen_face_washer || 0);
  }
  cost += bathrooms * ((rates.linen_hand_towel || 0) + (rates.linen_bath_mat || 0));
  cost += kitchens * 2 * (rates.linen_tea_towel || 0);
  cost += sofaBeds * (
    3 * (rates.linen_queen_flat_sheet || 0) +
    4 * (rates.linen_pillowcase || 0) +
    2 * (rates.linen_bath_towel || 0) +
    2 * (rates.linen_face_washer || 0)
  );
  if (cleanType === SERVICE_TYPES.AIRBNB_TURNOVER && extraToilets > 0) {
    cost += extraToilets * (rates.linen_hand_towel || 0);
  }
  return cost;
}

export type CalcResult = {
  sellPriceIncGst: number;
  estimatedHours: number;
  hourlyRateIncGst: number;
  totalExGst: number;
  gst: number;
};

/**
 * Sell-price calculation. Returns ONLY customer-facing figures.
 * Logic mirrors src/lib/pricingCalculator.ts `calculate()` (calculated mode).
 */
export function calculate(input: CalcInput, rates: Rates): CalcResult {
  const defaultGp = rates.default_gp_percent || 0.40;
  const effectiveGp = input.gpOverride != null ? input.gpOverride / 100 : defaultGp;
  const gpSafe = Math.min(Math.max(effectiveGp, 0), 0.99);

  const hourlyRateIncGst = getHourlyRateIncGst(input.cleanType, rates);

  const effectiveHours = input.cleanType === SERVICE_TYPES.DEEP_CLEAN
    ? input.hours * (input.deepCleanMultiplier || rates.deep_clean_multiplier || 1.5)
    : input.hours;

  const hasLinen = !NO_LINEN_TYPES.has(input.cleanType) &&
    input.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER &&
    input.linenRequired !== false;
  const linenCost = hasLinen
    ? calculateLinenCost(input.bedTypes, input.sofaBeds, input.bathrooms, input.kitchens, input.extraToilets || 0, input.cleanType, rates)
    : 0;

  const isAirbnb = input.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER;
  let consumablesCostIncGst = 0;
  if (isAirbnb) consumablesCostIncGst = calculateConsumablesCostIncGst(input.consumables);
  const consumablesExGst = consumablesCostIncGst / 1.1;
  const consumablesGst = consumablesCostIncGst - consumablesExGst;

  const specialistCost = input.cleanType === SERVICE_TYPES.POST_RENOVATION
    ? (input.specialistChemicals || 0) : 0;

  const photoReportFeeExGst = input.includePhotoReport ? PHOTO_REPORTING_FEE : 0;
  const photoReportGst = photoReportFeeExGst * 0.1;

  // Calculated mode
  const labourSellIncGst = hourlyRateIncGst * effectiveHours;
  const labourSellExGst = labourSellIncGst / 1.1;
  const labourGst = labourSellIncGst - labourSellExGst;

  let linenSellExGst = 0, linenGst = 0;
  if (linenCost > 0) { linenSellExGst = linenCost / (1 - gpSafe); linenGst = linenSellExGst * 0.1; }

  let specialistSellExGst = 0, specialistGst = 0;
  if (specialistCost > 0) { specialistSellExGst = specialistCost / (1 - gpSafe); specialistGst = specialistSellExGst * 0.1; }

  const sellPriceExGst = labourSellExGst + linenSellExGst + specialistSellExGst + consumablesExGst + photoReportFeeExGst;
  const totalGst = labourGst + linenGst + specialistGst + consumablesGst + photoReportGst;
  const sellPriceIncGst = sellPriceExGst + totalGst;

  // Travel surcharge (flat, per clean)
  const distanceKm = input.distanceKm || 0;
  const zone1 = rates.travel_zone_1_max_km || 25;
  const zone2 = rates.travel_zone_2_max_km || 35;
  const fee2 = rates.travel_zone_2_fee || 20;
  const fee3 = rates.travel_zone_3_fee || 30;
  let travelSurcharge = 0;
  if (distanceKm > zone2) travelSurcharge = fee3;
  else if (distanceKm > zone1) travelSurcharge = fee2;

  // Multi-property discount
  const activePropertyCount = input.activePropertyCount || 1;
  const discountPct = (rates.multi_property_discount_pct || 5) / 100;
  const multiPropertyDiscount = activePropertyCount >= 2 ? sellPriceIncGst * discountPct : 0;

  const finalSellIncGst = sellPriceIncGst + travelSurcharge - multiPropertyDiscount;
  const finalExGst = finalSellIncGst / 1.1;

  return {
    sellPriceIncGst: finalSellIncGst,
    estimatedHours: input.hours,
    hourlyRateIncGst,
    totalExGst: finalExGst,
    gst: finalSellIncGst - finalExGst,
  };
}
