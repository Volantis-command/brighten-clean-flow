// ── Brightly Official Service Types ──
// Single source of truth for all service type names and defaults

export const SERVICE_TYPES = {
  STANDARD_CLEAN: 'Standard Clean',
  DEEP_CLEAN: 'Deep Clean',
  BOND_END_OF_LEASE: 'Bond / End of Lease Clean',
  AIRBNB_TURNOVER: 'Airbnb / Short-Stay Turnover',
  POST_RENOVATION: 'Post-Renovation Clean',
  OFFICE_COMMERCIAL: 'Office / Commercial Clean',
} as const;

export type ServiceType = (typeof SERVICE_TYPES)[keyof typeof SERVICE_TYPES];

export const ALL_SERVICE_TYPES: ServiceType[] = [
  SERVICE_TYPES.STANDARD_CLEAN,
  SERVICE_TYPES.DEEP_CLEAN,
  SERVICE_TYPES.BOND_END_OF_LEASE,
  SERVICE_TYPES.AIRBNB_TURNOVER,
  SERVICE_TYPES.POST_RENOVATION,
  SERVICE_TYPES.OFFICE_COMMERCIAL,
];

// Quote calculator service types (admin)
export const QUOTE_SERVICE_TYPES: ServiceType[] = [
  SERVICE_TYPES.AIRBNB_TURNOVER,
  SERVICE_TYPES.DEEP_CLEAN,
  SERVICE_TYPES.POST_RENOVATION,
  SERVICE_TYPES.BOND_END_OF_LEASE,
  SERVICE_TYPES.STANDARD_CLEAN,
  SERVICE_TYPES.OFFICE_COMMERCIAL,
];

// Client-facing (portal, onboarding, quote request)
export const CLIENT_SERVICE_TYPES: string[] = [
  SERVICE_TYPES.STANDARD_CLEAN,
  SERVICE_TYPES.DEEP_CLEAN,
  SERVICE_TYPES.BOND_END_OF_LEASE,
  SERVICE_TYPES.OFFICE_COMMERCIAL,
  'Other',
];

// Legacy fallback default hours for service types not covered by calculateDefaultHours
export const DEFAULT_HOURS: Record<string, number> = {
  [SERVICE_TYPES.STANDARD_CLEAN]: 2,
  [SERVICE_TYPES.DEEP_CLEAN]: 6,
  [SERVICE_TYPES.BOND_END_OF_LEASE]: 8,
  [SERVICE_TYPES.AIRBNB_TURNOVER]: 3,
  [SERVICE_TYPES.POST_RENOVATION]: 7,
  [SERVICE_TYPES.OFFICE_COMMERCIAL]: 3,
};

/**
 * Stepped hour calculation based on bedrooms/bathrooms.
 * Covers Standard, Deep, Bond/EOL, and Airbnb.
 * Falls back to DEFAULT_HOURS for Post-Reno, Office, etc.
 */
export function calculateDefaultHours(cleanType: string, bedrooms: number, bathrooms: number): number {
  // Types not covered by the stepped formula — use legacy constant
  if (
    cleanType === SERVICE_TYPES.POST_RENOVATION ||
    cleanType === SERVICE_TYPES.OFFICE_COMMERCIAL
  ) {
    return DEFAULT_HOURS[cleanType] || 3;
  }

  let hours = 1.5; // base
  for (let i = 1; i <= bedrooms; i++) hours += i <= 2 ? 0.25 : 0.5;
  for (let i = 1; i <= bathrooms; i++) hours += i <= 2 ? 0.25 : 0.5;
  hours = Math.max(hours, 2); // 2hr minimum

  if (cleanType === SERVICE_TYPES.DEEP_CLEAN) hours *= 1.5;

  return hours;
}

// Consumable kits (replace old flat $15 fee)
export const CONSUMABLE_KITS = [
  {
    key: 'amenities_kit',
    name: 'Amenities Kit',
    price: 6.5,
    description: '1× Shampoo, 1× Conditioner, 1× Body Wash, 1× Hand Soap',
  },
  {
    key: 'wash_kit',
    name: 'Wash Kit',
    price: 7.5,
    description: '2× Dishwasher Powder, 2× Dishwashing Liquid, 2× Dishwashing Detergent, 1× Scourer, Bin Liners',
  },
  {
    key: 'tea_coffee_kit',
    name: 'Tea/Coffee Kit',
    price: 6.5,
    description: 'Tea, Coffee, Milk & Sugar supply',
  },
] as const;

export const PHOTO_REPORTING_FEE = 20; // $20 + GST per clean (optional)

// Helper: map legacy names to new names
export function normaliseLegacyServiceType(name: string): string {
  const map: Record<string, string> = {
    // Exact official names
    'Standard Clean': SERVICE_TYPES.STANDARD_CLEAN,
    'Deep Clean': SERVICE_TYPES.DEEP_CLEAN,
    'Bond / End of Lease Clean': SERVICE_TYPES.BOND_END_OF_LEASE,
    'Airbnb / Short-Stay Turnover': SERVICE_TYPES.AIRBNB_TURNOVER,
    'Post-Renovation Clean': SERVICE_TYPES.POST_RENOVATION,
    'Office / Commercial Clean': SERVICE_TYPES.OFFICE_COMMERCIAL,
    // Legacy display names
    'House Clean': SERVICE_TYPES.STANDARD_CLEAN,
    'Standard House Clean': SERVICE_TYPES.STANDARD_CLEAN,
    'Residential One-Off': SERVICE_TYPES.STANDARD_CLEAN,
    'Turnover Clean': SERVICE_TYPES.AIRBNB_TURNOVER,
    'Airbnb Turnover': SERVICE_TYPES.AIRBNB_TURNOVER,
    'Airbnb': SERVICE_TYPES.AIRBNB_TURNOVER,
    'Short Stay': SERVICE_TYPES.AIRBNB_TURNOVER,
    'Short-Stay': SERVICE_TYPES.AIRBNB_TURNOVER,
    'End of Lease': SERVICE_TYPES.BOND_END_OF_LEASE,
    'End of Lease Clean': SERVICE_TYPES.BOND_END_OF_LEASE,
    'End of Lease / Bond Clean': SERVICE_TYPES.BOND_END_OF_LEASE,
    'Bond Clean': SERVICE_TYPES.BOND_END_OF_LEASE,
    'Post-Build': SERVICE_TYPES.POST_RENOVATION,
    'Post-Build Clean': SERVICE_TYPES.POST_RENOVATION,
    'Post Renovation': SERVICE_TYPES.POST_RENOVATION,
    // Snake_case form keys (from lead/portal forms)
    'standard_clean': SERVICE_TYPES.STANDARD_CLEAN,
    'house_clean': SERVICE_TYPES.STANDARD_CLEAN,
    'deep_clean': SERVICE_TYPES.DEEP_CLEAN,
    'end_of_lease': SERVICE_TYPES.BOND_END_OF_LEASE,
    'bond_clean': SERVICE_TYPES.BOND_END_OF_LEASE,
    'airbnb': SERVICE_TYPES.AIRBNB_TURNOVER,
    'airbnb_turnover': SERVICE_TYPES.AIRBNB_TURNOVER,
    'short_stay': SERVICE_TYPES.AIRBNB_TURNOVER,
    'short-stay': SERVICE_TYPES.AIRBNB_TURNOVER,
    'post_renovation': SERVICE_TYPES.POST_RENOVATION,
    'office_commercial': SERVICE_TYPES.OFFICE_COMMERCIAL,
  };
  return map[name] || name;
}

// Client portal internal key mapping
export function portalKeyToLabel(key: string): string {
  const map: Record<string, string> = {
    'standard_clean': SERVICE_TYPES.STANDARD_CLEAN,
    'house_clean': SERVICE_TYPES.STANDARD_CLEAN,
    'deep_clean': SERVICE_TYPES.DEEP_CLEAN,
    'end_of_lease': SERVICE_TYPES.BOND_END_OF_LEASE,
    'office_commercial': SERVICE_TYPES.OFFICE_COMMERCIAL,
    'other': 'Other',
  };
  return map[key] || key;
}

export const PORTAL_CLEAN_TYPES = [
  { value: 'standard_clean', label: SERVICE_TYPES.STANDARD_CLEAN },
  { value: 'deep_clean', label: SERVICE_TYPES.DEEP_CLEAN },
  { value: 'end_of_lease', label: SERVICE_TYPES.BOND_END_OF_LEASE },
  { value: 'office_commercial', label: SERVICE_TYPES.OFFICE_COMMERCIAL },
  { value: 'other', label: 'Other' },
];
