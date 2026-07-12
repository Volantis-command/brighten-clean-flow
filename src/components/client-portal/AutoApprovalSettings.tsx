interface AutoApprovalSettingsProps {
  token: string;
  propertyId: string;
  property: unknown;
}

/**
 * Auto-confirm remains intentionally hidden until the canonical turnover
 * transaction can enforce the configured gap and daily safety cap atomically.
 * Keeping the component boundary lets portals ship without presenting a
 * control that does not yet change scheduling behaviour.
 */
export default function AutoApprovalSettings(_props: AutoApprovalSettingsProps) {
  return null;
}
