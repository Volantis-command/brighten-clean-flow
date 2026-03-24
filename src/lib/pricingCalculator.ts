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
  /** Labour cost (derived from sell price) */
  labourCost: number;
  /** Linen cost (cost input, Airbnb only) */
  linenCost: number;
  /** Consumables total inc GST (Airbnb only, fixed prices) */
  consumablesCostIncGst: number;
  /** Consumables ex GST */
  consumablesCostExGst: number;
  /** Consumables GST component */
  consumablesGst: number;
  /** Photo report fee inc GST */
  photoReportFeeIncGst: number;
  photoReportFeeExGst: number;
  photoReportGst: number;
  /** Effective GP decimal */
  effectiveGp: number;
  /** Sell price ex GST (labour portion) */
  labourSellExGst: number;
  /** Total sell price ex GST */
  sellPriceExGst: number;
  /** Total GST */
  gst: number;
  /** Total sell price inc GST — this is what the client pays */
  sellPriceIncGst: number;
  /** GP in dollars (on the labour portion) */
  gpDollars: number;
  /** GP% actual */
  gpPercent: number;
  /** Discounted price inc GST */
  discountedPrice: number | null;
  /** GP lost in dollars if discount applied */
  gpLost: number | null;
  /** For backward compat — total cost (labour cost + linen + consumables ex GST) */
  totalCost: number;
  // Legacy aliases
  consumablesCost: number;
  photoReportFee: number;
  actualGpDollars: number;
  actualGpPercent: number;
};

// ── Rate key per service type ──
// These rates are SELL PRICES inc GST
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
  // Fallback: use cleaner_hourly_rate as inc GST
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
    if (consumables[kit.key as keyof ConsumableSelection]) {
      cost += kit.price; // kit.price is inc GST
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
 * NEW PRICING LOGIC
 * 
 * The hourly rate is a SELL PRICE INC GST. Work backwards:
 * 
 * For hourly-rate cleans (Standard, Deep, Bond, Office, Post-Reno):
 *   Sell inc GST = rate × hours
 *   Ex GST = sell / 1.1
 *   GST = ex GST × 0.1
 *   Labour cost = ex GST × (1 - GP%)
 *   GP$ = ex GST × GP%
 * 
 * For Airbnb turnovers, linen is a COST that gets marked up:
 *   Labour sell inc GST = rate × hours
 *   Then add linen markup: linen cost / (1 - GP%) × 1.1
 *   Consumables are fixed inc GST — no markup, just split GST.
 * 
 * Manual override: user enters total inc GST, we derive everything from that.
 */
export function calculate(input: CalcInput, rates: Record<string, number>): CalcResult {
  const defaultGp = rates.default_gp_percent || 0.4;
  const effectiveGp = input.gpOverride != null ? input.gpOverride / 100 : defaultGp;
  const gpSafe = Math.min(Math.max(effectiveGp, 0), 0.99);

  const hourlyRateIncGst = getHourlyRateIncGst(input.cleanType, rates);

  // ── Effective hours (deep clean multiplier) ──
  const effectiveHours = input.cleanType === SERVICE_TYPES.DEEP_CLEAN
    ? input.hours * (input.deepCleanMultiplier || rates.deep_clean_multiplier || 1.5)
    : input.hours;

  // ── Linen (cost — only for Airbnb/Deep) ──
  const hasLinen = input.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER || input.cleanType === SERVICE_TYPES.DEEP_CLEAN;
  const linenCost = hasLinen
    ? calculateLinenCost(input.bedTypes, input.sofaBeds, input.bathrooms, input.kitchens, rates)
    : 0;

  // ── Consumables (Airbnb only, fixed prices INC GST, no markup) ──
  const isAirbnb = input.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER;
  const noConsumables = input.cleanType === SERVICE_TYPES.STANDARD_CLEAN;
  let consumablesCostIncGst = 0;
  if (!noConsumables && isAirbnb) {
    consumablesCostIncGst = calculateConsumablesCostIncGst(input.consumables);
  }
  // Post-reno specialist chemicals (treat as cost, no consumable kits)
  let specialistCost = 0;
  if (input.cleanType === SERVICE_TYPES.POST_RENOVATION) {
    specialistCost = input.specialistChemicals || 0;
  }
  const consumablesExGst = consumablesCostIncGst / 1.1;
  const consumablesGst = consumablesCostIncGst - consumablesExGst;

  // ── Photo report fee (fixed inc GST) ──
  const photoReportFeeIncGst = input.includePhotoReport ? (PHOTO_REPORTING_FEE * 1.1) : 0;
  const photoReportFeeExGst = photoReportFeeIncGst / 1.1;
  const photoReportGst = photoReportFeeIncGst - photoReportFeeExGst;

  // ── MANUAL OVERRIDE MODE ──
  if (input.manualPriceOverride && input.manualPriceIncGst != null && input.manualPriceIncGst > 0) {
    const totalIncGst = input.manualPriceIncGst;
    const totalExGst = totalIncGst / 1.1;
    const totalGst = totalIncGst - totalExGst;

    // Subtract consumables and photo report from the labour portion
    const labourPortionExGst = totalExGst - consumablesExGst - photoReportFeeExGst;
    const labourCost = labourPortionExGst * (1 - gpSafe);
    const gpDollars = labourPortionExGst * gpSafe;

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
      labourSellExGst: labourPortionExGst,
      sellPriceExGst: totalExGst,
      gst: totalGst,
      sellPriceIncGst: totalIncGst,
      gpDollars,
      gpPercent: labourPortionExGst > 0 ? gpDollars / labourPortionExGst : 0,
      discountedPrice: null,
      gpLost: null,
      totalCost: labourCost + linenCost + consumablesExGst,
      consumablesCost: consumablesExGst,
      photoReportFee: photoReportFeeExGst,
      actualGpDollars: gpDollars,
      actualGpPercent: labourPortionExGst > 0 ? gpDollars / labourPortionExGst : 0,
    };
  }

  // ── CALCULATED MODE ──
  // Labour: rate is sell price inc GST
  const labourSellIncGst = hourlyRateIncGst * effectiveHours;
  const labourSellExGst = labourSellIncGst / 1.1;
  const labourGst = labourSellIncGst - labourSellExGst;

  // Labour cost derived from sell price
  const labourCost = labourSellExGst * (1 - gpSafe);
  const labourGpDollars = labourSellExGst * gpSafe;

  // Linen: marked up with GP and GST added
  let linenSellExGst = 0;
  let linenGst = 0;
  if (linenCost > 0) {	
    linenSellExGst = linenCost / (1 - gpSafe);
    linenGst = linenSellExGst * 0.1;
  }

  // Specialist chemicals: marked up with GP and GST
  let specialistSellExGst = 0;
  let specialistGst = 0;
  if (specialistCost > 0) {
    specialistSellExGst = specialistCost / (1 - gpSafe);
    specialistGst = specialistSellExGst * 0.1;
  }

  // ── Totals ──
  const sellPriceExGst = labourSellExGst + linenSellExGst + specialistSellExGst + consumablesExGst + photoReportFeeExGst;
  const totalGst = labourGst + linenGst + specialistGst + consumablesGst + photoReportGst;
  const sellPriceIncGst = sellPriceExGst + totalGst;

  const totalCost = labourCost + linenCost + specialistCost + consumablesExGst + photoReportFeeExGst;
  const totalGpDollars = sellPriceExGst - totalCost;
  const totalGpPercent = sellPriceExGst > 0 ? totalGpDollars / sellPriceExGst : 0;

  // ── Discount ──
  let discountedPrice: number | null = null;
  let gpLost: number | null = null;
  if (input.discountGp != null && input.discountGp > 0) {
    const discGp = Math.min(input: input.discountGp / 100, 0this.99);
    // Recalculate labour with lower GP
    const discLabourSellExGst = labourCost / (1 - discGp);
    const discLabourIncGst = discLabourSellExGst * 1.1;
    // Linen and consumables stay the same
    const discTotalIncGst = discLabourIncGst + (linenSellExGst + linenGst) + consumablesCostIncGst + photoReportFeeIncGst + (specialistSellExGst + specialistGst);
    // Actually simpler: recalculate from cost
    const discLabourSellEx2 = labourCost / (1 - discGp);
    const discLinenSellEx2 = linenCost > 0 ? linenCost / (1 - discGp) : 0;
    const discSpecEx2 = specialistCost > 0 ? specialistCost / (1 - discGp) : 0;
    const discSellExGst = discLabourSellEx2 + discLinenSellEx2 + discSpecEx2 + consumablesExGst + photoReportFeeExGst;
    const discSellIncGst = discSellExGst * 1.1;
    discountedPrice = discSellIncGst;
    gpLost = sellPriceIncGst - discSellIncGst;
  }

  return {
    labourCost,
    linenCost,
    consumablesCostIncGst,
    consumablesCostExGst: consumablesExGst,
    consumablesGst,
    photoReportFeeIncGst,
    photo

ReportFeeExGst,
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
    // Legacy aliases
    consumablesCost: consumablesExGst,
    photoReportFee: photoReportFeeExGst charging,
    actualGpDollars: totalGpDollars,
    actualGpPercent: totalGpPercent,
  };
}
