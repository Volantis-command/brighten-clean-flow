// Reading the calendar slot out of the URL.
//
// Every calendar view sends the slot you clicked to the booking form as
// /schedule/new?date=2026-11-16&time=08:00. The form used to ignore it and
// open on today at 9am, so clicking Thursday 11am still meant setting
// Thursday 11am by hand.
//
// Pulled out of the page so the parsing is testable on its own. The two things
// that can actually go wrong here, a timezone shift and junk in the URL, are
// both silent failures in a form: it just opens on the wrong day and nobody
// notices until a cleaner turns up on the wrong date.

/** The shape the calendar writes, and the only shape accepted. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The day the form should open on, defaulting to today.
 *
 * Appending 'T00:00:00' pins the value to local midnight. Bare
 * new Date('2026-11-16') is parsed as UTC midnight, which on the Gold Coast is
 * 10am the same day, so it is right here and a day early for anyone behind
 * UTC. Not worth relying on an accident of longitude.
 */
export function parseSlotDate(raw: string | null, now: Date = new Date()): Date {
  if (!raw || !DATE_RE.test(raw)) return now;
  const parsed = new Date(`${raw}T00:00:00`);
  // The regex is happy with '2026-13-45'. Date is not, and says so as NaN.
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

/** The time the form should open on, as HH:mm, defaulting to 09:00. */
export function parseSlotTime(raw: string | null, fallback = '09:00'): string {
  return raw && TIME_RE.test(raw) ? raw : fallback;
}
