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
};

export type CalcResult = {
  labourCost: number;
  linenCost: number;
  consumablesCost: number;
  photoReportFee: number;
  totalCost: number;
  effectiveGp: number;
  sellPriceExGst: number;
  gst: number;
  sellPriceIncGst: number;
  actualGpDollars: number;
  actualGpPercent: number;
  discountedPrice: number | null;
  gpLost: number | null;
};

function sheetRateKey(bt: BedType): string {
  switch (bt) {
    case 'King': return 'linen_king_flat_sheet';
    case 'Queen': return 'linen_queen_flat_sheet';
    case 'King Single': case 'Single': return 'linen_king_single_flat_sheet';
  }
}

export function calculateConsumablesCost(consumables?: ConsumableSelection): number {
  if (!consumables) return 0;
  let cost = 0;
  for (const kit of CONSUMABLE_KITS) {
    if (consumables[kit.key as keyof ConsumableSelection]) {
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

export function calculate(input: CalcInput, rates: Record<string, number>): CalcResult {
  const hourlyRate = rates.cleaner_hourly_rate || 70;
  const defaultGp = rates.default_gp_percent || 0.4;

  // 1. Labour
  const effectiveHours = input.cleanType === SERVICE_TYPES.DEEP_CLEAN
    ? input.hours * (input.deepCleanMultiplier || rates.deep_clean_multiplier || 1.5)
    : input.hours;
  const labourCost = effectiveHours * hourlyRate;

  // 2. Linen
  const hasLinen = input.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER || input.cleanType === SERVICE_TYPES.DEEP_CLEAN;
  const linenCost = hasLinen
    ? calculateLinenCost(input.bedTypes, input.sofaBeds, input.bathrooms, input.kitchens, rates)
    : 0;

  // 3. Consumables — itemised kits (no flat fee)
  const noConsumables = input.cleanType === SERVICE_TYPES.STANDARD_CLEAN;
  let consumablesCost = 0;
  if (!noConsumables) {
    consumablesCost = calculateConsumablesCost(input.consumables);
    if (input.cleanType === SERVICE_TYPES.POST_RENOVATION) {
      consumablesCost += (input.specialistChemicals || 0);
    }
  }

  // 4. Photo reporting fee (optional)
  const photoReportFee = input.includePhotoReport ? PHOTO_REPORTING_FEE : 0;

  // 5. Total cost
  const totalCost = labourCost + linenCost + consumablesCost + photoReportFee;

  // 6. GP
  const effectiveGp = input.gpOverride != null ? input.gpOverride / 100 : defaultGp;
  const gpSafe = Math.min(effectiveGp, 0.99);

  // 7-9. Sell price
  const sellPriceExGst = totalCost / (1 - gpSafe);
  const gst = sellPriceExGst * 0.10;
  const sellPriceIncGst = sellPriceExGst + gst;

  // 10-11. Actual GP
  const actualGpDollars = sellPriceExGst - totalCost;
  const actualGpPercent = sellPriceExGst > 0 ? actualGpDollars / sellPriceExGst : 0;

  // Discount
  let discountedPrice: number | null = null;
  let gpLost: number | null = null;
  if (input.discountGp != null && input.discountGp > 0) {
    const discGpSafe = Math.min(input.discountGp / 100, 0.99);
    const discSellExGst = totalCost / (1 - discGpSafe);
    discountedPrice = discSellExGst * 1.10;
    gpLost = sellPriceExGst - discSellExGst;
  }

  return {
    labourCost,
    linenCost,
    consumablesCost,
    photoReportFee,
    totalCost,
    effectiveGp,
    sellPriceExGst,
    gst,
    sellPriceIncGst,
    actualGpDollars,
    actualGpPercent,
    discountedPrice,
    gpLost,
  };
}
