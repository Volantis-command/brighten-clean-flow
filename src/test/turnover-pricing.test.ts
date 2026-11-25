import { describe, it, expect } from 'vitest';
import {
  quote, settingsFrom, parseBeds, inputFromProperty, applyListing, BLANK_INPUT, NO_BEDS, roundHours,
  type QuoteInput, type PropertyRow,
} from '@/lib/turnoverPricing';

// Live pricing_settings linen and consumable rates, 25 Nov 2026.
const RATES: Record<string, number> = {
  linen_king_flat_sheet: 3.36, linen_queen_flat_sheet: 3.05, linen_king_single_flat_sheet: 2.84,
  linen_pillowcase: 1.52, linen_bath_towel: 2, linen_face_washer: 1.26, linen_hand_towel: 1.31,
  linen_bath_mat: 1.58, linen_tea_towel: 1.05,
  consumable_amenities_kit: 6.5, consumable_tea_coffee_kit: 6.5, consumable_wash_kit: 7.5,
  photo_reporting_fee: 20,
};
const S = settingsFrom({});

const row = (over: Partial<PropertyRow>): PropertyRow => ({
  id: 'x', property_name: 'x', client_name: null, property_type: 'Apartment', bedrooms: 2, bathrooms: 2,
  toilets: 1, living_areas: null, kitchens: null, balconies: null, sofa_beds: null, max_guests: null,
  has_pool: false, has_outdoor_area: false, bed_config: null, bed_types: null, estimated_hours: null,
  default_price: null, price_turnover: null, price_includes_gst: true, amenities_kit: null,
  tea_coffee_kit: null, wash_kit: null, ...over,
});

const priceOf = (r: PropertyRow, linen: boolean) => quote(inputFromProperty(r, linen), S, RATES).totalInc;

describe('the model reproduces what we charge today', () => {
  // Coastal: we supply linen. Every one lands within $2 of the agreed price.
  it.each([
    ['Reflections 202', row({ bedrooms: 2, bathrooms: 2, has_outdoor_area: true, bed_config: '1 King Bed, 2 Single Beds' }), 303.6],
    ['Reflections 1501', row({ bedrooms: 3, bathrooms: 2, has_outdoor_area: true, bed_config: '2 King Beds, 2 Single Beds' }), 368.5],
    ['Reflections 1903', row({ bedrooms: 3, bathrooms: 3, bed_config: '2 King Beds, 2 Single Beds' }), 330],
    ['Kirra Beach', row({ bed_config: '1 King Bed, 2 Single Beds' }), 240],
    ['Rocks 9J', row({ bed_config: '1 Queen Bed, 2 Single Beds' }), 240],
    ['Royal Palms', row({ bed_config: '1 King Bed, 2 Single Beds' }), 240],
    ['Rainbow Pacific', row({ bathrooms: 1, bed_config: '1 Queen Bed, 2 Single Beds' }), 215],
  ])('%s', (_name, r, actual) => {
    expect(Math.abs(priceOf(r, true) - actual)).toBeLessThanOrEqual(2);
  });

  // Kingscliff: client supplies linen, so it is hours x $82.50 and nothing else.
  it('Magnolia and Ohana exactly', () => {
    expect(priceOf(row({ property_type: null, bedrooms: 3, bathrooms: 2, toilets: 2, has_pool: true, has_outdoor_area: true }), false)).toBe(288.75);
    expect(priceOf(row({ property_type: null, bedrooms: 4, bathrooms: 2, toilets: 3, has_outdoor_area: true }), false)).toBe(330);
  });
});

describe('quote', () => {
  const base: QuoteInput = { ...BLANK_INPUT, beds: { ...NO_BEDS, king: 1, queen: 2 } };

  it('shows linen as the only difference between with and without', () => {
    const r = quote({ ...base, weSupplyLinen: true }, S, RATES);
    expect(r.withLinenInc - r.withoutLinenInc).toBeCloseTo(r.linen, 2);
    expect(quote({ ...base, weSupplyLinen: false }, S, RATES).linen).toBe(0);
  });

  it('overrides win over the formula but the formula is still shown', () => {
    const r = quote({ ...base, hoursOverride: 6, priceOverride: 450 }, S, RATES);
    expect(r.hours).toBe(6);
    expect(r.totalInc).toBe(450);
    expect(r.formulaTotal).not.toBe(450);
  });

  it('a bunk bed is two beds of linen', () => {
    const one = quote({ ...base, beds: { ...NO_BEDS, kingSingle: 2 } }, S, RATES).linenItemCost;
    const bunk = quote({ ...base, beds: { ...NO_BEDS, bunk: 1 } }, S, RATES).linenItemCost;
    expect(bunk).toBe(one);
  });

  it('GST splits cleanly', () => {
    const r = quote({ ...base, priceOverride: 330 }, S, RATES);
    expect(r.totalEx).toBe(300);
    expect(r.gst).toBe(30);
  });

  it('edited settings flow straight through', () => {
    const cheap = quote(base, { ...S, rateInc: 70 }, RATES);
    expect(cheap.labour).toBeCloseTo(cheap.hours * 70, 2);
  });
});

describe('parseBeds', () => {
  it('reads the client text', () => {
    expect(parseBeds('1 King Bed, 2 Single Beds')).toMatchObject({ king: 1, single: 2 });
    expect(parseBeds('Bedroom 1: King, Bedroom 2: Queen, Bedroom 3: Queen, Bedroom 4: Two King Singles'))
      .toMatchObject({ king: 1, queen: 2, kingSingle: 2 });
    expect(parseBeds('Bedroom 4: Bunk Beds, Bunk Beds')).toMatchObject({ bunk: 2 });
  });

  it('falls back to the room picker', () => {
    expect(parseBeds(null, { 0: 'King', 1: 'Queen', 2: 'Queen', 3: 'Two Singles' }))
      .toMatchObject({ king: 1, queen: 2, single: 2 });
  });
});

it('roundHours goes to the nearest step', () => {
  expect(roundHours(4.1, 0.25)).toBe(4);
  expect(roundHours(4.125, 0.25)).toBe(4.25);
  expect(roundHours(3.3, 0)).toBe(3.3);
});

describe('applyListing', () => {
  const listing = {
    property_name: 'Palm Beach Poolside Haven', address: '52 Japonica Drive, Palm Beach', property_type: 'house' as const,
    bedrooms: 4, bathrooms: 3, separate_toilets: 1, living_areas: 2, levels: 2, kitchens: 2,
    beds: { king: 1, queen: 3, double: 0, king_single: 0, single: 2, bunk: 1, sofa: 0 },
    outdoor: true, pool: true, granny_flat: true, sleeps: 12, notes: 'Office pod', unsure: ['beds'],
  };

  it('fills every property fact and keeps the commercial settings', () => {
    const prev = { ...BLANK_INPUT, weSupplyLinen: false, travelFee: 20, amenitiesKit: true, hoursOverride: 9 };
    const next = applyListing(prev, listing);
    expect(next).toMatchObject({
      propertyType: 'house', bedrooms: 4, bathrooms: 3, separateToilets: 1, livingAreas: 2, levels: 2, kitchens: 2,
      outdoor: true, pool: true, grannyFlat: true,
      beds: { king: 1, queen: 3, double: 0, kingSingle: 0, single: 2, bunk: 1, sofa: 0 },
      weSupplyLinen: false, travelFee: 20, amenitiesKit: true, hoursOverride: null,
    });
  });

  it('never lets bad numbers through', () => {
    const next = applyListing(BLANK_INPUT, { ...listing, bedrooms: -2, living_areas: 0, levels: NaN as unknown as number });
    expect(next.bedrooms).toBe(0);
    expect(next.livingAreas).toBe(1);
    expect(next.levels).toBe(1);
  });
});

describe('Kingscliff houses, from their public listings (their linen)', () => {
  // bd, ba, separate toilets, living areas, levels, pool, beds -> agreed price
  const house = (bd: number, ba: number, wc: number, living: number, levels: number, pool: boolean, beds: Partial<typeof NO_BEDS>): QuoteInput => ({
    ...BLANK_INPUT, propertyType: 'house', bedrooms: bd, bathrooms: ba, separateToilets: wc, livingAreas: living,
    levels, pool, outdoor: true, weSupplyLinen: false, beds: { ...NO_BEDS, ...beds },
  });
  const price = (i: QuoteInput) => quote(i, S, RATES).totalInc;

  it('Ohana and Salty to the cent', () => {
    expect(price(house(4, 2, 0, 1, 3, false, { king: 1, queen: 2, kingSingle: 2 }))).toBe(330);
    expect(price(house(4, 2, 0, 1, 1, true, { king: 1, queen: 2, bunk: 2 }))).toBe(412.5);
  });

  it('Casa Del Salt, Casa Luxe and North Point within $15', () => {
    expect(Math.abs(price(house(4, 3, 0, 2, 2, true, { king: 1, double: 1, single: 2, queen: 1 })) - 375)).toBeLessThanOrEqual(15);
    expect(Math.abs(price(house(4, 2, 0, 3, 1, true, { king: 1, single: 2, queen: 2 })) - 385)).toBeLessThanOrEqual(15);
    expect(Math.abs(price(house(4, 3, 1, 2, 2, true, { king: 1, queen: 2, kingSingle: 2 })) - 385)).toBeLessThanOrEqual(15);
  });
});
