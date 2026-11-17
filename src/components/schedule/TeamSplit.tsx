// ============================================================================
// Two or more cleaners on one clean.
//
// BJ, 18 Oct 2026: one job, not two blocks. A hairline splits the block into a
// band per cleaner with their first name on it, so a glance at the week tells
// you a clean is double crewed and who is on it.
// ============================================================================

import { getCleanerColor } from './cleanerColors';
import type { JobCleaner } from '@/lib/jobCleaners';

/** Where one cleaner stands on one job. */
export type BandStatus = 'accepted' | 'pending' | 'declined';

// BJ, 17 Nov 2026: one cleaner answering should not repaint the whole block.
// Each band carries ITS OWN cleaner's answer, so a half-green, half-amber
// clean reads at a glance as "Jess is on, Lucy has not replied" — which is a
// different problem to "nobody has replied" and wants a different action.
//
// All three are light enough for the dark text the block already uses, and
// they differ in lightness as well as hue, so the bands stay distinguishable
// without relying on colour vision alone. The name on each band is the real
// answer for that; colour is the glance.
const BAND_FILL: Record<BandStatus, string> = {
  accepted: '#4ADE80',
  pending: '#FCD34D',
  declined: '#F87171',
};

const BAND_LABEL: Record<BandStatus, string> = {
  accepted: 'accepted',
  pending: 'no reply yet',
  declined: 'declined',
};

/** The hairlines and the name on each band, drawn over a job block. */
export function TeamSplit({
  team,
  height,
  textColor,
  statusByCleaner,
}: {
  team: JobCleaner[];
  height: number;
  textColor: string;
  /** cleaner id -> their answer. Absent means no offer has gone out yet. */
  statusByCleaner?: Record<string, BandStatus>;
}) {
  if (team.length < 2) return null;
  const bandH = height / team.length;
  const showNames = bandH >= 16;
  // Only paint when the answers actually differ. A clean everybody has
  // accepted is already green, and repainting it in a second green just adds
  // noise to a week that is mostly fine.
  const answers = team.map((c) => statusByCleaner?.[c.id]);
  const paint = !!statusByCleaner && new Set(answers.map((a) => a ?? 'none')).size > 1;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {team.map((c, i) => {
        const answer = statusByCleaner?.[c.id];
        const fill = paint && answer ? BAND_FILL[answer] : undefined;
        return (
          <div
            key={c.id}
            className="absolute left-0 right-0 flex items-start justify-end pr-1"
            style={{
              top: `${(i / team.length) * 100}%`,
              height: `${100 / team.length}%`,
              borderTop: i === 0 ? 'none' : '1px dashed rgba(255,255,255,.55)',
              background: fill,
            }}
          >
            {showNames && (
              <span
                className="mt-[1px] rounded-sm px-1 text-[9px] font-extrabold leading-[1.25]"
                style={{ background: 'rgba(0,0,0,.18)', color: fill ? '#0B1F17' : textColor }}
              >
                {bandH >= 24 ? c.first : c.initial}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "Jess accepted · Lucy no reply yet" — the words behind the colours. */
export function teamSplitSummary(
  team: JobCleaner[],
  statusByCleaner?: Record<string, BandStatus>,
): string {
  if (!statusByCleaner) return '';
  return team
    .map((c) => {
      const a = statusByCleaner[c.id];
      return `${c.first} ${a ? BAND_LABEL[a] : 'not offered yet'}`;
    })
    .join(' · ');
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
