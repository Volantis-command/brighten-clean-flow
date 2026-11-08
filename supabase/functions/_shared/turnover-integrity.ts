export const CANCELLED_RESERVATION_STATUSES = new Set([
  'cancelled', 'canceled', 'denied', 'declined', 'expired',
]);

export const CONFIRMED_RESERVATION_STATUSES = new Set(['new', 'modified', 'confirmed']);

export function normaliseReservationStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function isConfirmedStay(status: string): boolean {
  return CONFIRMED_RESERVATION_STATUSES.has(normaliseReservationStatus(status));
}

export function isCancelledStay(status: string): boolean {
  return CANCELLED_RESERVATION_STATUSES.has(normaliseReservationStatus(status));
}

export function dateInTimeZone(timeZone = 'Australia/Brisbane', offsetDays = 0, now = new Date()): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function hostawayTurnoverKey(propertyId: string, checkoutDate: string): string {
  return `hostaway:${propertyId}:${checkoutDate}`;
}

export function icalTurnoverKey(propertyId: string, externalRef: string): string {
  return `ical:${propertyId}:${externalRef}`;
}

export function mergeExternalRefs(existing: unknown, incoming: string): string[] {
  const refs = Array.isArray(existing) ? existing.filter((value): value is string => typeof value === 'string' && value.length > 0) : [];
  return [...new Set([...refs, incoming])];
}

// --- Guesty ---------------------------------------------------------------
// Guesty is a separate PMS to Hostaway with its own status vocabulary, so it
// gets its own helpers rather than widening the sets above. Widening them
// would silently change what Hostaway and the iCal sync treat as a live stay,
// and those two are already in production.
//
// Guesty's live statuses are 'confirmed', 'checkedIn' and 'checkedOut'. A
// checked-out stay still needs its clean, so it counts as confirmed here —
// under the Hostaway set it would have been skipped as unconfirmed and the
// turnover simply would not have appeared.
export const GUESTY_CONFIRMED_STATUSES = new Set([
  'confirmed', 'checkedin', 'checkedout',
]);

export function isConfirmedGuestyStay(status: string | null | undefined): boolean {
  return GUESTY_CONFIRMED_STATUSES.has(normaliseReservationStatus(status));
}

export function guestyTurnoverKey(propertyId: string, checkoutDate: string): string {
  return `guesty:${propertyId}:${checkoutDate}`;
}
