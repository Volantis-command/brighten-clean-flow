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

// Default estimated hours per service type for quoting
export const DEFAULT_HOURS: Record<string, number> = {
  [SERVICE_TYPES.STANDARD_CLEAN]: 2.5,
  [SERVICE_TYPES.DEEP_CLEAN]: 6,
  [SERVICE_TYPES.BOND_END_OF_LEASE]: 8,
  [SERVICE_TYPES.AIRBNB_TURNOVER]: 3,
  [SERVICE_TYPES.POST_RENOVATION]: 7,
  [SERVICE_TYPES.OFFICE_COMMERCIAL]: 3,
};

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
    'House Clean': SERVICE_TYPES.STANDARD_CLEAN,
    'Turnover Clean': SERVICE_TYPES.AIRBNB_TURNOVER,
    'End of Lease': SERVICE_TYPES.BOND_END_OF_LEASE,
    'End of Lease Clean': SERVICE_TYPES.BOND_END_OF_LEASE,
    'Post-Build': SERVICE_TYPES.POST_RENOVATION,
    'Post-Build Clean': SERVICE_TYPES.POST_RENOVATION,
    'Residential One-Off': SERVICE_TYPES.STANDARD_CLEAN,
    'Deep Clean': SERVICE_TYPES.DEEP_CLEAN,
    'Standard Clean': SERVICE_TYPES.STANDARD_CLEAN,
    'Bond / End of Lease Clean': SERVICE_TYPES.BOND_END_OF_LEASE,
    'Airbnb / Short-Stay Turnover': SERVICE_TYPES.AIRBNB_TURNOVER,
    'Post-Renovation Clean': SERVICE_TYPES.POST_RENOVATION,
    'Office / Commercial Clean': SERVICE_TYPES.OFFICE_COMMERCIAL,
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
