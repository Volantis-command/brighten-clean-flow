// BnB Booking's client portal crashed on 24 Nov 2026 (React error #31):
// access_details defaults to {} and the portal tried to print it. asText is
// what now stands between a jsonb column and the page.
import { describe, it, expect } from 'vitest';
import { asText } from '@/pages/MagicLinkPortalPage';

describe('asText', () => {
  it('THE BUG: an empty object shows nothing instead of crashing', () => {
    expect(asText({})).toBeNull();
  });
  it('bed_types lists its beds', () => {
    expect(asText({ 0: 'King', 1: 'Queen', 2: 'Two Singles' })).toBe('King · Queen · Two Singles');
  });
  it('a filled access_details reads as labelled text', () => {
    expect(asText({ lockbox_code: '1234', gate: 'left side' })).toBe('lockbox code: 1234 · gate: left side');
  });
  it('blank entries inside an object are skipped', () => {
    expect(asText({ lockbox_code: '', gate: null })).toBeNull();
  });
  it('plain text and numbers pass through, blanks show nothing', () => {
    expect(asText('Key safe')).toBe('Key safe');
    expect(asText('   ')).toBeNull();
    expect(asText(3)).toBe('3');
    expect(asText(null)).toBeNull();
    expect(asText(undefined)).toBeNull();
  });
});
