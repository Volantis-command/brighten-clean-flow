// The one list of job durations.
//
// This used to be copy-pasted into four files that had all drifted apart:
// the property scheduler stopped at 4 hr, the lead scheduler at 5 hr, and Add
// Job / Edit Job both labelled 300 minutes as "4 hr+" when 300 minutes is
// five hours. Big jobs could not be booked at their real length, and the ones
// that were booked recorded the wrong duration, so the calendar drew them too
// short and the day looked emptier than it was.
//
// Value is always MINUTES, stored on jobs.duration_minutes. Half hours up to
// six, then whole hours to twelve, which covers a full-day deep clean or a
// two-cleaner handover.

export interface JobDuration {
  value: string;   // minutes, as a string because it feeds a <Select>
  label: string;
}

export const DURATIONS: JobDuration[] = [
  { value: '60',  label: '1 hr' },
  { value: '90',  label: '1.5 hr' },
  { value: '120', label: '2 hr' },
  { value: '150', label: '2.5 hr' },
  { value: '180', label: '3 hr' },
  { value: '210', label: '3.5 hr' },
  { value: '240', label: '4 hr' },
  { value: '270', label: '4.5 hr' },
  { value: '300', label: '5 hr' },
  { value: '330', label: '5.5 hr' },
  { value: '360', label: '6 hr' },
  { value: '420', label: '7 hr' },
  { value: '480', label: '8 hr' },
  { value: '540', label: '9 hr' },
  { value: '600', label: '10 hr' },
  { value: '660', label: '11 hr' },
  { value: '720', label: '12 hr' },
];

/** Human label for any stored minutes value, including ones not in the list. */
export function durationLabel(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const known = DURATIONS.find(d => Number(d.value) === minutes);
  if (known) return known.label;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr`;
}
