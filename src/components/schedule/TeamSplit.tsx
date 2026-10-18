// ============================================================================
// Two or more cleaners on one clean.
//
// BJ, 18 Oct 2026: one job, not two blocks. A hairline splits the block into a
// band per cleaner with their first name on it, so a glance at the week tells
// you a clean is double crewed and who is on it.
// ============================================================================

import { getCleanerColor } from './cleanerColors';
import type { JobCleaner } from '@/lib/jobCleaners';

/** The hairlines and the name on each band, drawn over a job block. */
export function TeamSplit({ team, height, textColor }: { team: JobCleaner[]; height: number; textColor: string }) {
  if (team.length < 2) return null;
  const bandH = height / team.length;
  const showNames = bandH >= 16;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {team.map((c, i) => (
        <div
          key={c.id}
          className="absolute left-0 right-0 flex items-start justify-end pr-1"
          style={{
            top: `${(i / team.length) * 100}%`,
            height: `${100 / team.length}%`,
            borderTop: i === 0 ? 'none' : '1px dashed rgba(255,255,255,.55)',
          }}
        >
          {showNames && (
            <span
              className="mt-[1px] rounded-sm px-1 text-[9px] font-extrabold leading-[1.25]"
              style={{ background: 'rgba(0,0,0,.18)', color: textColor }}
            >
              {bandH >= 24 ? c.first : c.initial}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Name chips, one per cleaner, in their own colour. For wider blocks and lists. */
export function TeamChips({ team, compact = false }: { team: JobCleaner[]; compact?: boolean }) {
  if (team.length === 0) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {team.map((c) => {
        const colour = getCleanerColor(c.id);
        return (
          <span
            key={c.id}
            title={c.name}
            className={`truncate rounded-full font-extrabold leading-tight ${compact ? 'px-1.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}
            style={{ background: colour.hsl, color: '#fff' }}
          >
            {compact ? c.first : c.name.split(' ')[0]}
          </span>
        );
      })}
    </span>
  );
}
