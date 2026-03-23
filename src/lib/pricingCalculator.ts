export type BedType = 'King' | 'Queen' | 'King Single' | 'Single';

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
};

export type CalcResult = {
  labourCost: number;
  linenCost: number;
  consumablesCost: number;
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

export function calculateLinenCost(
  bedTypes: BedType[],
  sofaBeds: number,
  bathrooms: number,
  kitchens: number,
  rates: Record<string, number>
): number {
  let cost = 0;

  // Per bed: 3x flat sheets (matching size) + 4x pillowcases + 2x bath towels + 2x face washers
  for (const bt of bedTypes) {
    const sheetRate = rates[sheetRateKey(bt)] || 0;
    cost += 3 * sheetRate;
    cost += 4 * (rates.linen_pillowcase || 0);
    cost += 2 * (rates.linen_bath_towel || 0);
    cost += 2 * (rates.linen_face_washer || 0);
  }

  // Per bathroom: 1x hand towel + 1x bath mat
  cost += bathrooms * ((rates.linen_hand_towel || 0) + (rates.linen_bath_mat || 0));

  // Per kitchen: 2x tea towels
  cost += kitchens * 2 * (rates.linen_tea_towel || 0);

  // Per sofa bed: 3x king single flat sheets + 2x pillowcases + 1x bath towel + 1x face washer
  cost += sofaBeds * (
    3 * (rates.linen_king_single_flat_sheet || 0) +
    2 * (rates.linen_pillowcase || 0) +
    1 * (rates.linen_bath_towel || 0) +
    1 * (rates.linen_face_washer || 0)
  );

  return cost;
}

export function calculate(input: CalcInput, rates: Record<string, number>): CalcResult {
  const hourlyRate = rates.cleaner_hourly_rate || 45;
  const consumablesFlat = rates.consumables_flat_fee || 15;
  const defaultGp = rates.default_gp_percent || 0.4;

  // 1. Labour
  const effectiveHours = input.cleanType === 'Deep Clean'
    ? input.hours * (input.deepCleanMultiplier || rates.deep_clean_multiplier || 1.5)
    : input.hours;
  const labourCost = effectiveHours * hourlyRate;

  // 2. Linen
  const hasLinen = input.cleanType === 'Turnover Clean' || input.cleanType === 'Deep Clean';
  const linenCost = hasLinen
    ? calculateLinenCost(input.bedTypes, input.sofaBeds, input.bathrooms, input.kitchens, rates)
    : 0;

  // 3. Consumables — excluded for Residential One-Off (labour-only pricing)
  const noConsumables = input.cleanType === 'Residential One-Off';
  const consumablesCost = noConsumables
    ? 0
    : input.cleanType === 'Post-Build'
      ? consumablesFlat + (input.specialistChemicals || 0)
      : consumablesFlat;

  // 4. Total cost
  const totalCost = labourCost + linenCost + consumablesCost;

  // 5. GP
  const effectiveGp = input.gpOverride != null ? input.gpOverride / 100 : defaultGp;
  const gpSafe = Math.min(effectiveGp, 0.99);

  // 6-8. Sell price
  const sellPriceExGst = totalCost / (1 - gpSafe);
  const gst = sellPriceExGst * 0.10;
  const sellPriceIncGst = sellPriceExGst + gst;

  // 9-10. Actual GP
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
