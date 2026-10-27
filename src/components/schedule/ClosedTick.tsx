// ============================================================================
// The tick, and the nudge.
//
// A closed clean wears a tick and fades back. A clean that still wants
// something wears a chip saying what. Scan the week: anything bright or
// chipped needs you, everything else is finished with.
// ============================================================================

import { Check, AlertTriangle } from 'lucide-react';

export function ClosedTick({ reason, size = 'sm' }: { reason?: string | null; size?: 'sm' | 'md' }) {
  const px = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span
      className={`pointer-events-none absolute right-1 top-1 z-20 grid place-items-center rounded-full bg-emerald-500 text-white shadow-sm ${px}`}
      title={reason === 'no_invoice_needed' ? 'Closed off, no invoice needed' : 'Closed off, invoice sent'}
      aria-label="Closed off"
    >
      <Check className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={3.5} />
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
