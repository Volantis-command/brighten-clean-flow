// ============================================================================
// Who is on a job.
//
// One place that answers "which cleaners are on this clean", so the calendar,
// the legend and anything else never has to know how many slots the jobs table
// happens to have. Today that is cleaner_1_id and cleaner_2_id; when slot 3 and
// 4 land, only this file changes.
// ============================================================================

export const MAX_CLEANERS = 4;

export const CLEANER_SLOTS = [
  'cleaner_1_id',
  'cleaner_2_id',
  'cleaner_3_id',
  'cleaner_4_id',
] as const;

export type CleanerSlot = typeof CLEANER_SLOTS[number];

export interface JobCleaner {
  id: string;
  /** Slot number, 1 based. Slot 1 leads the clean. */
  slot: number;
  name: string;
  first: string;
  initial: string;
}

/** Cleaner ids on a job, in slot order, with the empty slots dropped. */
export function jobCleanerIds(job: any): string[] {
  if (!job) return [];
  const ids: string[] = [];
  CLEANER_SLOTS.forEach((slot) => {
    const id = job[slot];
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

/** The team on a job, ready to render. */
export function jobCleaners(job: any, nameMap: Record<string, string>): JobCleaner[] {
  return jobCleanerIds(job).map((id, i) => {
    const name = (nameMap[id] || 'Unknown').trim();
    const first = name.split(' ')[0] || name;
    return { id, slot: i + 1, name, first, initial: (first[0] || '?').toUpperCase() };
  });
}

/** "Jess", "Jess and Mia", "Jess, Mia and Rae". */
export function teamLabel(team: JobCleaner[]): string {
  const names = team.map((c) => c.first);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}
