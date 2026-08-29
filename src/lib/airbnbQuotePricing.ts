// ── Brightly quote pricing — shared source of truth ──
// Extracted verbatim from src/pages/AirbnbQuotePage.tsx (the admin calculator BJ
// trusts as accurate) so the CLIENT-facing quote returns the exact same number.
// Airbnb: cost/(1-GP). Residential: hours × flat client rate (no linen/consumables/GP).

export type Rates = {
  labourRate: number;
  consumables: number;
  gpDefault: number;
  kingSheet: number;
  queenSheet: number;
  singleSheet: number;
  pillow: number;
  bathTowel: number;
  bathMat: number;
  handTowel: number;
  faceWasher: number;
  teaTowel: number;
  laundryBag: number;
  [key: string]: number;
};

export const DEFAULT_RATES: Rates = {
  labourRate: 45,
  consumables: 5,
  gpDefault: 0.35,
  kingSheet: 3.52,
  queenSheet: 3.19,
  singleSheet: 2.97,
  pillow: 1.595,
  bathTowel: 2.09,
  bathMat: 1.65,
  handTowel: 1.375,
  faceWasher: 1.32,
  teaTowel: 1.10,
  laundryBag: 0.99,
};

// Client-facing residential rate — flat sell $/hr (no cost/GP maths; this IS the price).
export const RESIDENTIAL_HOURLY = 70;

export type Packs = { bedQ: number; bedK: number; bedS: number; bath: number; kitchen: number };

export function packs(r: Rates): Packs {
  return {
    bedQ: 3 * r.queenSheet + 4 * r.pillow + 2 * r.bathTowel + 2 * r.faceWasher,
    bedK: 3 * r.kingSheet + 4 * r.pillow + 2 * r.bathTowel + 2 * r.faceWasher,
    bedS: 3 * r.singleSheet + 2 * r.pillow + 1 * r.bathTowel + 1 * r.faceWasher,
    bath: 2 * r.bathMat + 2 * r.handTowel,
    kitchen: 2 * r.teaTowel + r.laundryBag,
  };
}

export const BED_CONFIGS = [
  { name: "1 Queen", q: 1, k: 0, s: 0 },
  { name: "1 King", q: 0, k: 1, s: 0 },
  { name: "1 Single", q: 0, k: 0, s: 1 },
  { name: "2 Singles", q: 0, k: 0, s: 2 },
  { name: "3 Singles", q: 0, k: 0, s: 3 },
  { name: "Queen + Single", q: 1, k: 0, s: 1 },
  { name: "King + Single", q: 0, k: 1, s: 1 },
  { name: "2 Queens", q: 2, k: 0, s: 0 },
  { name: "2 Kings", q: 0, k: 2, s: 0 },
  { name: "Queen + 2 Singles", q: 1, k: 0, s: 2 },
  { name: "King + 2 Singles", q: 0, k: 1, s: 2 },
];

export function configLinen(cfgName: string, p: Packs): number {
  const c = BED_CONFIGS.find((x) => x.name === cfgName) ?? BED_CONFIGS[0];
  return c.q * p.bedQ + c.k * p.bedK + c.s * p.bedS;
}

export type PropertyType = { name: string; beds: number; baths: number; labour: number };

export const TYPES: PropertyType[] = [
  { name: "1 bed 1 bath", beds: 1, baths: 1, labour: 1.5 },
  { name: "2 bed 1 bath", beds: 2, baths: 1, labour: 1.75 },
  { name: "2 bed 2 bath", beds: 2, baths: 2, labour: 2.25 },
  { name: "3 bed 1 bath", beds: 3, baths: 1, labour: 2.15 },
  { name: "3 bed 2 bath", beds: 3, baths: 2, labour: 2.75 },
  { name: "3 bed 3 bath", beds: 3, baths: 3, labour: 3.0 },
  { name: "4 bed 1 bath", beds: 4, baths: 1, labour: 2.75 },
  { name: "4 bed 2 bath", beds: 4, baths: 2, labour: 3.25 },
  { name: "4 bed 3 bath", beds: 4, baths: 3, labour: 3.5 },
  { name: "4 bed 4 bath", beds: 4, baths: 4, labour: 4.0 },
  { name: "5 bed 2 bath", beds: 5, baths: 2, labour: 3.75 },
  { name: "5 bed 3 bath", beds: 5, baths: 3, labour: 4.0 },
  { name: "6 bed 3 bath", beds: 6, baths: 3, labour: 4.5 },
  { name: "6 bed 4 bath", beds: 6, baths: 4, labour: 5.0 },
];

export type AirbnbQuoteInput = {
  typeIdx: number;
  rooms: string[];
  labourHrs: number;
  linenIncluded: boolean;
  consumablesIncluded: boolean;
  gp?: number;
};

export type QuoteResult = {
  sellExGst: number;
  sellIncGst: number;
  hours: number;
};

/** Airbnb turnover quote — mirrors AirbnbQuotePage exactly (cost / (1 - GP)). */
export function airbnbQuote(input: AirbnbQuoteInput, rates: Rates = DEFAULT_RATES): QuoteResult {
  const p = packs(rates);
  const type = TYPES[input.typeIdx];
  const gp = input.gp ?? rates.gpDefault;

  const bedroomLinen = input.linenIncluded
    ? input.rooms.slice(0, type.beds).reduce((sum, cfg) => sum + configLinen(cfg, p), 0)
    : 0;
  const bathLinen = input.linenIncluded ? type.baths * p.bath : 0;
  const kitchenLinen = input.linenIncluded ? p.kitchen : 0;
  const linenTotal = bedroomLinen + bathLinen + kitchenLinen;

  const labourCost = input.labourHrs * rates.labourRate;
  const consumablesTotal = input.consumablesIncluded ? rates.consumables * type.baths : 0;
  const cost = labourCost + linenTotal + consumablesTotal;
  const sellExGst = cost / (1 - gp);

  return { sellExGst, sellIncGst: sellExGst * 1.1, hours: input.labourHrs };
}

/**
 * Deep clean hours.
 *
 * A deep clean is not a turnover with more elbow grease. It is ovens, tracks,
 * skirtings, inside cupboards, tiles and grout, so the hours are roughly triple
 * a standard clean and they scale differently.
 *
 * Bathrooms are weighted heavier than bedrooms on purpose: industry guidance is
 * consistent that bathroom count drives deep-clean time more than bedroom
 * count, because a bedroom is mostly surfaces while a bathroom is grout,
 * screens and fittings.
 *
 * Anchored on 4 hours for a 1 bed 1 bath, which is Brendan's own number and sits
 * at the top of the 2 to 4 hour range published for a single experienced
 * cleaner. Brightly does the thorough version, so the top of the range is right.
 */
export const DEEP_BASE_HOURS = 4;      // 1 bed 1 bath
export const DEEP_PER_BEDROOM = 1.0;   // each bedroom beyond the first
export const DEEP_PER_BATHROOM = 1.5;  // each bathroom beyond the first

export function deepCleanHours(typeIdx: number): number {
  const t = TYPES[typeIdx];
  return DEEP_BASE_HOURS
    + Math.max(0, t.beds - 1) * DEEP_PER_BEDROOM
    + Math.max(0, t.baths - 1) * DEEP_PER_BATHROOM;
}

/**
 * Deep clean quote. Hourly, like residential, but at the deep-clean rate.
 *
 * NOTE the rate is EX GST, matching RESIDENTIAL_HOURLY above. The page shows
 * consumers the inc-GST figure, so a 4 hour clean displays as $374, not $340.
 * If the $85 was meant to be the inc-GST price, divide this constant by 1.1.
 */
export const DEEP_CLEAN_HOURLY = 85;

export function deepCleanQuote(typeIdx: number, hourly: number = DEEP_CLEAN_HOURLY): QuoteResult {
  const hours = deepCleanHours(typeIdx);
  const sellExGst = hours * hourly;
  return { sellExGst, sellIncGst: sellExGst * 1.1, hours };
}

/** Residential quote — flat client hourly rate × hours. No linen / consumables / GP maths. */
export function residentialQuote(typeIdx: number, hourly: number = RESIDENTIAL_HOURLY): QuoteResult {
  const type = TYPES[typeIdx];
  const sellExGst = type.labour * hourly;
  return { sellExGst, sellIncGst: sellExGst * 1.1, hours: type.labour };
}
