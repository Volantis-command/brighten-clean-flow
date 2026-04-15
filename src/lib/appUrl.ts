const PUBLISHED_APP_URL = 'https://app.brightly.cleaning';

/**
 * Returns the base URL to use when building a customer-facing link
 * (SMS, email, copy-to-clipboard share). Customer-facing links MUST
 * always resolve to the published app, never to a Lovable preview or
 * a staging host — otherwise customers hit a Lovable login screen
 * (which is what was happening before this fix).
 *
 * Rules:
 *   - SSR / no window → published URL (safe default)
 *   - Production host (app.brightly.cleaning) → use it
 *   - Local dev (localhost / 127.0.0.1) → use it (so devs can test locally)
 *   - Anything else (Lovable preview, branch previews, staging, etc.) → published URL
 *
 * Belt-and-suspenders allowlist instead of a denylist of preview hosts —
 * Lovable has used multiple preview domains over time (lovableproject.com,
 * lovable.app, lovable.dev, id-preview--*) and any new one we forget would
 * silently break customer links again.
 */
export function getAppBaseUrl() {
  if (typeof window === 'undefined') return PUBLISHED_APP_URL;

  const hostname = window.location.hostname;

  // Allowlist: hosts where window.location.origin is the right thing to share.
  if (hostname === 'app.brightly.cleaning') return window.location.origin;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return window.location.origin;

  // Everything else — preview, staging, unknown — fall back to the published URL.
  return PUBLISHED_APP_URL;
}
