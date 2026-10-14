// ============================================================================
// Time off, drawn on the calendar.
//
// BJ, 14 Oct 2026: "i want it on the calender in a very smart way."
// The day itself carries it: a tinted column and the first names of whoever is
// away, so an empty-looking day reads as "Jess is off", not "nothing booked".
// ============================================================================

import { cn } from '@/lib/utils';
import type { DayOff } from '@/hooks/useTimeOff';

/** First names on a day cell. Quiet until it matters, then unmistakable. */
export function TimeOffChips({ off, className, max = 2 }: { off?: DayOff[]; className?: string; max?: number }) {
  if (!off?.length) return null;
  const shown = off.slice(0, max);
  const extra = off.length - shown.length;

  return (
    <div className={cn('flex w-full flex-wrap items-center justify-center gap-1 px-1', className)}>
      {shown.map((o) => (
        <span
          key={o.id}
          title={`${o.name} off${o.reason ? ` · ${o.reason}` : ''}`}
          className="max-w-full truncate rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-amber-500"
        >
          {o.first} off
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[10px] font-bold text-amber-500" title={off.slice(max).map((o) => o.name).join(', ')}>
          +{extra}
        </span>
      )}
    </div>
  );
}

/** The day view has room for the whole sentence. */
export function TimeOffNote({ off }: { off?: DayOff[] }) {
  if (!off?.length) return null;
  return (
    <p className="mt-1 text-sm font-bold text-amber-500">
      {off.map((o) => o.name.split(' ')[0]).join(', ')} {off.length === 1 ? 'is' : 'are'} off today
      {off.length === 1 && off[0].reason ? ` · ${off[0].reason}` : ''}
      {off.length === 1 && off[0].lastDay ? ' · back tomorrow' : ''}
    </p>
  );
}
