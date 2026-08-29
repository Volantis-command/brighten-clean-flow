// The lead ladder. One definition, used by every screen and every automation.
//
// The old app had eight statuses with duplicates ('accepted' vs
// 'client_accepted', 'quote_sent' vs 'awaiting_client_response') plus a second
// unrelated machine on profiles.lead_stage. Anything that needs to know where a
// lead is reads this file now.

export type LeadStage =
  | 'new' | 'contacted' | 'in_conversation' | 'quoted' | 'booked' | 'won' | 'lost';

export interface StageDef {
  key: LeadStage;
  label: string;
  /** One line telling BJ what this column actually means. */
  blurb: string;
  /** Hours a lead may sit here before the card goes red. */
  rotHours: number;
  tone: string;      // tailwind classes for the column header
  dot: string;       // colour chip
  /** Closed stages are hidden from the board by default. */
  closed?: boolean;
}

export const STAGES: StageDef[] = [
  { key: 'new', label: 'New', blurb: 'Just arrived. Nobody has spoken to them yet.',
    rotHours: 1, tone: 'border-amber-400', dot: 'bg-amber-400' },
  { key: 'contacted', label: 'Contacted', blurb: 'Our first text sent. Waiting on them.',
    rotHours: 48, tone: 'border-sky-400', dot: 'bg-sky-400' },
  { key: 'in_conversation', label: 'Needs reply', blurb: 'They wrote back. You owe them an answer.',
    rotHours: 2, tone: 'border-rose-500', dot: 'bg-rose-500' },
  { key: 'quoted', label: 'Quoted', blurb: 'A price is with them. Chase it.',
    rotHours: 72, tone: 'border-violet-400', dot: 'bg-violet-400' },
  { key: 'booked', label: 'Booked', blurb: 'Clean is in the calendar.',
    rotHours: 24 * 30, tone: 'border-emerald-500', dot: 'bg-emerald-500' },
  { key: 'won', label: 'Won', blurb: 'Clean completed.',
    rotHours: 24 * 365, tone: 'border-emerald-600', dot: 'bg-emerald-600', closed: true },
  { key: 'lost', label: 'Lost', blurb: 'Not proceeding.',
    rotHours: 24 * 365, tone: 'border-muted', dot: 'bg-muted-foreground', closed: true },
];

export const OPEN_STAGES = STAGES.filter(s => !s.closed);

export const stageDef = (k?: string | null): StageDef =>
  STAGES.find(s => s.key === k) || STAGES[0];

/**
 * Has this lead been sitting still too long for the stage it is in?
 * New tolerates an hour. "Needs reply" tolerates two. Quoted tolerates three
 * days. The thresholds live with the stage because the urgency is different.
 */
export function isRotting(lead: { stage?: string | null; stage_changed_at?: string | null }): boolean {
  const def = stageDef(lead.stage);
  if (def.closed) return false;
  const since = lead.stage_changed_at ? new Date(lead.stage_changed_at).getTime() : null;
  if (!since) return false;
  return (Date.now() - since) / 36e5 > def.rotHours;
}

/** "12 days", "3 hr", "8 min" — for how long a card has sat where it is. */
export function ageLabel(iso?: string | null): string {
  if (!iso) return '';
  const mins = (Date.now() - new Date(iso).getTime()) / 6e4;
  if (mins < 60) return `${Math.max(1, Math.round(mins))} min`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr`;
  const d = Math.round(mins / 1440);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/**
 * "Fri 29 Aug, 9:14am" — when they actually landed.
 *
 * The board only ever showed time-in-stage, which turned out to be useless:
 * adding stage_changed_at with DEFAULT now() stamped every pre-existing lead
 * with the migration's own timestamp, so 37 leads that arrived weeks apart all
 * read "8 days in new" and there was no way to tell who had just come in.
 * The arrival time is a fact about the lead and cannot drift like that.
 */
export function arrivedLabel(iso?: string | null): string {
  if (!iso) return 'arrival time unknown';
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'Australia/Brisbane',
  }).replace(',', '');
}

/** Landed in the last 24 hours, so it earns a badge on the board. */
export function isBrandNew(iso?: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 24 * 36e5;
}

/**
 * Fill {first_name} style placeholders. Anything we have no value for is
 * removed rather than left as literal braces, because a customer must never
 * receive "Hey {first_name}".
 */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body
    .replace(/\{(\w+)\}/g, (_m, k) => {
      const v = vars[k];
      return v === null || v === undefined || v === '' ? '' : String(v);
    })
    // Tidy the gaps a missing value leaves behind.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.!?])/g, '$1')
    .trim();
}

export const leadName = (l: { first_name?: string | null; last_name?: string | null }) =>
  [l.first_name, l.last_name].filter(Boolean).join(' ').trim();
