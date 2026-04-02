/**
 * Assigns a stable unique colour to each cleaner based on their ID.
 * Palette chosen for readability on white backgrounds with white text.
 */

export interface CleanerColor {
  /** Tailwind-safe bg class (HSL via inline style instead) */
  bg: string;
  bgHover: string;
  text: string;
  border: string;
  dot: string;
  /** For inline style usage */
  hsl: string;
  hslLight: string;
}

// 10 distinct, vibrant hues — enough for most teams
const PALETTE: { h: number; s: number; l: number; name: string }[] = [
  { h: 174, s: 72, l: 40, name: 'Teal' },
  { h: 262, s: 60, l: 50, name: 'Purple' },
  { h: 14,  s: 80, l: 55, name: 'Coral' },
  { h: 213, s: 70, l: 50, name: 'Blue' },
  { h: 38,  s: 85, l: 50, name: 'Amber' },
  { h: 340, s: 65, l: 50, name: 'Rose' },
  { h: 150, s: 55, l: 40, name: 'Green' },
  { h: 290, s: 50, l: 55, name: 'Orchid' },
  { h: 195, s: 70, l: 45, name: 'Cyan' },
  { h: 25,  s: 75, l: 48, name: 'Burnt Orange' },
];

// Stable mapping: hash cleaner UUID to palette index
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const cache = new Map<string, number>();
let nextIdx = 0;

/**
 * Get a deterministic palette index for a cleaner.
 * Uses insertion order so the first cleaners seen always get distinct colours.
 */
export function getCleanerPaletteIndex(cleanerId: string): number {
  if (cache.has(cleanerId)) return cache.get(cleanerId)!;
  const idx = nextIdx % PALETTE.length;
  cache.set(cleanerId, idx);
  nextIdx++;
  return idx;
}

export function getCleanerColor(cleanerId: string | null): CleanerColor {
  if (!cleanerId) {
    return {
      bg: 'hsl(0 0% 85%)',
      bgHover: 'hsl(0 0% 80%)',
      text: '#555',
      border: 'hsl(0 0% 75%)',
      dot: 'hsl(0 0% 70%)',
      hsl: 'hsl(0 0% 85%)',
      hslLight: 'hsl(0 0% 95%)',
    };
  }
  const idx = getCleanerPaletteIndex(cleanerId);
  const p = PALETTE[idx];
  return {
    bg: `hsl(${p.h} ${p.s}% ${p.l}%)`,
    bgHover: `hsl(${p.h} ${p.s}% ${p.l - 5}%)`,
    text: '#fff',
    border: `hsl(${p.h} ${p.s}% ${p.l - 10}%)`,
    dot: `hsl(${p.h} ${p.s}% ${p.l}%)`,
    hsl: `hsl(${p.h} ${p.s}% ${p.l}%)`,
    hslLight: `hsl(${p.h} ${p.s - 10}% ${p.l + 38}%)`,
  };
}

export function getCleanerName(id: string | null, nameMap: Record<string, string>): string {
  if (!id) return 'Unassigned';
  return nameMap[id] || 'Unknown';
}

export function getCleanerInitial(id: string | null, nameMap: Record<string, string>): string {
  const name = getCleanerName(id, nameMap);
  return name.charAt(0).toUpperCase();
}

/**
 * Build a legend array from the jobs currently visible.
 */
export function buildCleanerLegend(
  jobs: { cleaner_1_id: string | null; cleaner_2_id: string | null }[],
  nameMap: Record<string, string>
): { id: string; name: string; color: CleanerColor }[] {
  const seen = new Set<string>();
  const legend: { id: string; name: string; color: CleanerColor }[] = [];

  jobs.forEach(j => {
    [j.cleaner_1_id, j.cleaner_2_id].forEach(cid => {
      if (cid && !seen.has(cid)) {
        seen.add(cid);
        legend.push({
          id: cid,
          name: getCleanerName(cid, nameMap),
          color: getCleanerColor(cid),
        });
      }
    });
  });

  return legend;
}
