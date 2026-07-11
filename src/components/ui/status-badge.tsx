/**
 * StatusBadge — one dark-theme status chip for the whole app.
 *
 * Replaces the scattered pastel light-mode chips (amber-100/amber-800,
 * yellow-100, gray-100, …) that render as white stickers on the dark UI.
 * Recipe lifted from FinancialsPage's InvoiceBadge: a translucent tint of the
 * tone colour + the bright tone colour as text — legible on dark surfaces.
 */

type Tone = 'green' | 'amber' | 'blue' | 'red' | 'grey';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: 'rgba(74,222,128,0.15)', fg: '#4ADE80' },
  amber: { bg: 'rgba(251,191,36,0.15)', fg: '#FCD34D' },
  blue: { bg: 'rgba(96,165,250,0.15)', fg: '#60A5FA' },
  red: { bg: 'rgba(248,113,113,0.15)', fg: '#F87171' },
  grey: { bg: 'rgba(255,255,255,0.08)', fg: '#94A3B8' },
};

const STATUS_TONE: Record<string, Tone> = {
  // green — done / good
  completed: 'green', complete: 'green', paid: 'green', confirmed: 'green',
  accepted: 'green', approved: 'green', active: 'green', done: 'green', booked: 'green',
  // amber — in flight / awaiting action
  in_progress: 'amber', pending: 'amber', pending_cleaner: 'amber',
  awaiting_cleaner: 'amber', awaiting_quote: 'amber', authorised: 'amber',
  quote_sent: 'amber', awaiting_schedule_approval: 'amber',
  // blue — upcoming / informational
  scheduled: 'blue', upcoming: 'blue', sent: 'blue', offer: 'blue', new_offer: 'blue',
  // red — stopped / failed
  cancelled: 'red', canceled: 'red', declined: 'red', overdue: 'red',
  rejected: 'red', failed: 'red', no_show: 'red',
  // grey — neutral / terminal-quiet
  draft: 'grey', void: 'grey', expired: 'grey', unknown: 'grey',
};

function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({
  status,
  label,
  tone: toneOverride,
  className = '',
}: {
  status?: string | null;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const key = (status || 'unknown').toLowerCase();
  const tone = toneOverride ?? STATUS_TONE[key] ?? 'grey';
  const c = TONE[tone];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${className}`}
      style={{ background: c.bg, color: c.fg }}
    >
      {label ?? titleCase(key)}
    </span>
  );
}

export default StatusBadge;
