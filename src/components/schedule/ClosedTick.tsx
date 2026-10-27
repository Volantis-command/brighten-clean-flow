// ============================================================================
// Closed off: one colour, one tick.
//
// BJ, 28 Oct 2026: "once it is ticked and no further action needed, i want 1
// colour, 1 prominent tick, and this overrides every other colour."
//
// So a closed clean stops being yellow, green, grey or purple. It becomes slate
// with a green tick, at full strength, whatever it was before.
// ============================================================================

import { Check, AlertTriangle } from 'lucide-react';

/** The one colour a finished clean wears, whatever it used to be. */
export const CLOSED_BG = 'hsl(215 24% 32%)';
export const CLOSED_BORDER = 'hsl(215 28% 20%)';
export const CLOSED_TEXT = '#EAF2F6';
/** Month view pills are pale, so they get the tinted version. */
export const CLOSED_PILL_BG = 'hsl(215 22% 88%)';
export const CLOSED_PILL_TEXT = 'hsl(215 30% 28%)';
export const CLOSED_PILL_BORDER = 'hsl(215 24% 45%)';

export function ClosedTick({ reason, size = 'md' }: { reason?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-7 w-7' : size === 'md' ? 'h-6 w-6' : 'h-5 w-5';
  const mark = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span
      className={`pointer-events-none absolute right-1.5 top-1.5 z-30 grid place-items-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white/90 ${box}`}
      title={reason === 'no_invoice_needed' ? 'Closed off, no invoice needed' : 'Closed off, invoice sent'}
      aria-label="Closed off"
    >
      <Check className={mark} strokeWidth={4} />
    </span>
  );
}

export function ActionChip({
  label, tone, compact = false,
}: { label: string; tone: 'warn' | 'bad' | null; compact?: boolean }) {
  const bad = tone === 'bad';
  return (
    <span
      className={`pointer-events-none absolute right-1 top-1 z-20 flex items-center gap-1 rounded-full font-extrabold shadow-sm ${
        compact ? 'px-1.5 py-[1px] text-[9px]' : 'px-2 py-0.5 text-[11px]'
      } ${bad ? 'bg-red-600 text-white' : 'bg-amber-400 text-[#3A2A00]'}`}
      title={label}
    >
      {bad && <AlertTriangle className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}
