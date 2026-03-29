import { SERVICE_TYPES, CONSUMABLE_KITS, PHOTO_REPORTING_FEE } from './serviceTypes';

export type BedType = 'King' | 'Queen' | 'King Single' | 'Single';

export type ConsumableSelection = {
  amenities_kit: boolean;
  wash_kit: boolean;
  tea_coffee_kit: boolean;
};

export type CalcInput = {
  cleanType: string;
  bedrooms: number;
  bathrooms: number;
  livingAreas: number;
  kitchens: number;
  balconies: number;
  sofaBeds: number;
  outdoorAreas: boolean;
  hours: number;
  bedTypes: BedType[];
  deepCleanMultiplier: number;
  specialistChemicals: number;
  gpOverride: number | null;
  discountGp: number | null;
  consumables?: ConsumableSelection;
  includePhotoReport?: boolean;
  manualPriceOverride?: boolean;
  manualPriceIncGst?: number;
};

export type CalcResult = {
  labourCost: number;
  linenCost: number;
  consumablesCostIncGst: number;
  consumablesCostExGst: number;
  consumablesGst: number;
  photoReportFeeIncGst: number;
  photoReportFeeExGst: number;
  photoReportGst: number;
  effectiveGp: number;
  labourSellExGst: number;
  sellPriceExGst: number;
  gst: number;
  sellPriceIncGst: number;
  gpDollars: number;
  gpPercent: number;
  discountedPrice: number | null;
  gpLost: number | null;
  totalCost: number;
  // Legacy aliases
  consumablesCost: number;
  photoReportFee: number;
  actualGpDollars: number;
  actualGpPercent: number;
};

// Rate key per service type — these are SELL PRICES inc GST
export const SERVICE_RATE_KEYS: Record<string, string> = {
  [SERVICE_TYPES.STANDARD_CLEAN]: 'rate_standard_clean',
  [SERVICE_TYPES.DEEP_CLEAN]: 'rate_deep_clean',
  [SERVICE_TYPES.BOND_END_OF_LEASE]: 'rate_bond_clean',
  [SERVICE_TYPES.AIRBNB_TURNOVER]: 'rate_airbnb_turnover',
  [SERVICE_TYPES.POST_RENOVATION]: 'rate_post_renovation',
  [SERVICE_TYPES.OFFICE_COMMERCIAL]: 'rate_office_commercial',
};

export function getHourlyRateIncGst(cleanType: string, rates: Record<string, number>): number {
  const key = SERVICE_RATE_KEYS[cleanType];
  if (key && rates[key] != null) return rates[key];
  return rates['cleaner_hourly_rate'] || 70;
}

function sheetRateKey(bt: BedType): string {
  switch (bt) {
    case 'King': return 'linen_king_flat_sheet';
    case 'Queen': return 'linen_queen_flat_sheet';
    case 'King Single': case 'Single': return 'linen_king_single_flat_sheet';
  }
}

export function calculateConsumablesCostIncGst(consumables?: ConsumableSelection): number {
  if (!consumables) return 0;
  let cost = 0;
  for (const kit of CONSUMABLE_KITS) {
    if (consumables[kit.key as keyof ConsumableSelection] === true) {
      cost += kit.price;
    }
  }
  return cost;
}

export function calculateLinenCost(
  bedTypes: BedType[],
  sofaBeds: number,
  bathrooms: number,
  kitchens: number,
  rates: Record<string, number>
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
    3 * (rates.linen_king_single_flat_sheet || 0) +
    2 * (rates.linen_pillowcase || 0) +
    1 * (rates.linen_bath_towel || 0) +
    1 * (rates.linen_face_washer || 0)
  );
  return cost;
}

/**
 * CORRECTED PRICING LOGIC
 *
 * Hourly rate = SELL PRICE inc GST (e.g. $70/hr).
 * Work backwards to derive cost and GP.
 *
 * Consumables (Airbnb): fixed prices inc GST, NO GP markup.
 * Linen (Airbnb/Deep): cost input, marked up with GP.
 */
export function calculate(input: CalcInput, rates: Record<string, number>): CalcResult {
  const defaultGp = rates.default_gp_percent || 0.4;
  const effectiveGp = input.gpOverride != null ? input.gpOverride / 100 : defaultGp;
  const gpSafe = Math.min(Math.max(effectiveGp, 0), 0.99);

  const hourlyRateIncGst = getHourlyRateIncGst(input.cleanType, rates);

  // Effective hours
  const effectiveHours = input.cleanType === SERVICE_TYPES.DEEP_CLEAN
    ? input.hours * (input.deepCleanMultiplier || rates.deep_clean_multiplier || 1.5)
    : input.hours;

  // Linen (cost)
  const hasLinen = input.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER || input.cleanType === SERVICE_TYPES.DEEP_CLEAN;
  const linenCost = hasLinen
    ? calculateLinenCost(input.bedTypes, input.sofaBeds, input.bathrooms, input.kitchens, rates)
    : 0;

  // Consumables (Airbnb only, fixed inc GST, no markup)
  const isAirbnb = input.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER;
  let consumablesCostIncGst = 0;
  if (isAirbnb) {
    consumablesCostIncGst = calculateConsumablesCostIncGst(input.consumables);
  }
  const consumablesExGst = consumablesCostIncGst / 1.1;
  const consumablesGst = consumablesCostIncGst - consumablesExGst;

  // Specialist chemicals (post-reno, cost input, marked up)
  const specialistCost = input.cleanType === SERVICE_TYPES.POST_RENOVATION
    ? (input.specialistChemicals || 0) : 0;

  // Photo report fee (fixed, $20 ex GST → $22 inc GST)
  const photoReportFeeExGst = input.includePhotoReport ? PHOTO_REPORTING_FEE : 0;
  const photoReportGst = photoReportFeeExGst * 0.1;
  const photoReportFeeIncGst = photoReportFeeExGst + photoReportGst;

  // ── MANUAL OVERRIDE ──
  if (input.manualPriceOverride && input.manualPriceIncGst != null && input.manualPriceIncGst > 0) {
    const totalIncGst = input.manualPriceIncGst;
    const totalExGst = totalIncGst / 1.1;
    const totalGst = totalIncGst - totalExGst;

    const labourPortionExGst = totalExGst - consumablesExGst - photoReportFeeExGst;
    const labourCostManual = Math.max(labourPortionExGst * (1 - gpSafe), 0);
    const gpDollars = labourPortionExGst * gpSafe;

    return {
      labourCost: labourCostManual,
      linenCost,
      consumablesCostIncGst,
      consumablesCostExGst: consumablesExGst,
      consumablesGst,
      photoReportFeeIncGst,
      photoReportFeeExGst,
      photoReportGst,
      effectiveGp: gpSafe,
      labourSellExGst: labourPortionExGst,
      sellPriceExGst: totalExGst,
      gst: totalGst,
      sellPriceIncGst: totalIncGst,
      gpDollars,
      gpPercent: labourPortionExGst > 0 ? gpDollars / labourPortionExGst : 0,
      discountedPrice: null,
      gpLost: null,
      totalCost: labourCostManual + linenCost + consumablesExGst + photoReportFeeExGst,
      consumablesCost: consumablesExGst,
      photoReportFee: photoReportFeeExGst,
      actualGpDollars: gpDollars,
      actualGpPercent: labourPortionExGst > 0 ? gpDollars / labourPortionExGst : 0,
    };
  }

  // ── CALCULATED MODE ──
  // Labour sell price (rate is inc GST)
  const labourSellIncGst = hourlyRateIncGst * effectiveHours;
  const labourSellExGst = labourSellIncGst / 1.1;
  const labourGst = labourSellIncGst - labourSellExGst;
  const labourCost = labourSellExGst * (1 - gpSafe);

  // Linen sell (cost marked up with GP + GST)
  let linenSellExGst = 0;
  let linenGst = 0;
  if (linenCost > 0) {
    linenSellExGst = linenCost / (1 - gpSafe);
    linenGst = linenSellExGst * 0.1;
  }

  // Specialist chemicals sell (cost marked up)
  let specialistSellExGst = 0;
  let specialistGst = 0;
  if (specialistCost > 0) {
    specialistSellExGst = specialistCost / (1 - gpSafe);
    specialistGst = specialistSellExGst * 0.1;
  }

  // Totals
  const sellPriceExGst = labourSellExGst + linenSellExGst + specialistSellExGst + consumablesExGst + photoReportFeeExGst;
  const totalGst = labourGst + linenGst + specialistGst + consumablesGst + photoReportGst;
  const sellPriceIncGst = sellPriceExGst + totalGst;

  const totalCost = labourCost + linenCost + specialistCost + consumablesExGst + photoReportFeeExGst;
  const totalGpDollars = sellPriceExGst - totalCost;
  const totalGpPercent = sellPriceExGst > 0 ? totalGpDollars / sellPriceExGst : 0;

  // Discount
  let discountedPrice: number | null = null;
  let gpLost: number | null = null;
  if (input.discountGp != null && input.discountGp > 0) {
    const discGp = Math.min(input.discountGp / 100, 0.99);
    // Recalculate marked-up items with lower GP
    const discLabourEx = labourCost / (1 - discGp);
    const discLinenEx = linenCost > 0 ? linenCost / (1 - discGp) : 0;
    const discSpecEx = specialistCost > 0 ? specialistCost / (1 - discGp) : 0;
    const discSellExGst = discLabourEx + discLinenEx + discSpecEx + consumablesExGst + photoReportFeeExGst;
    discountedPrice = discSellExGst * 1.1;
    gpLost = sellPriceIncGst - discountedPrice;
  }

  return {
    labourCost,
    linenCost,
    consumablesCostIncGst,
    consumablesCostExGst: consumablesExGst,
    consumablesGst,
    photoReportFeeIncGst,
    photoReportFeeExGst,
    photoReportGst,
    effectiveGp: gpSafe,
    labourSellExGst,
    sellPriceExGst,
    gst: totalGst,
    sellPriceIncGst,
    gpDollars: totalGpDollars,
    gpPercent: totalGpPercent,
    discountedPrice,
    gpLost,
    totalCost,
    consumablesCost: consumablesExGst,
    photoReportFee: photoReportFeeExGst,
    actualGpDollars: totalGpDollars,
    actualGpPercent: totalGpPercent,
  };
}
