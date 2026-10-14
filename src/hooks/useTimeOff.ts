// ============================================================================
// Time off, by date, for the calendar.
//
// Returns a lookup of "yyyy-MM-dd" → who is off that day, so a view can mark
// the day without each cell doing its own query.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { fetchTimeOffRange, type TimeOffRow } from '@/lib/timeOff';

export interface DayOff {
  id: string;
  user_id: string;
  name: string;
  /** First name, which is all a calendar cell has room for. */
  first: string;
  reason: string | null;
  /** True on the last day off, so the view can say when they are back. */
  lastDay: boolean;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function expand(rows: TimeOffRow[], from: string, to: string): Record<string, DayOff[]> {
  const byDate: Record<string, DayOff[]> = {};
  rows.forEach((r) => {
    let cursor = r.start_date > from ? r.start_date : from;
    while (cursor <= r.end_date && cursor <= to) {
      (byDate[cursor] ||= []).push({
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        first: r.name.split(' ')[0],
        reason: r.reason,
        lastDay: cursor === r.end_date,
      });
      cursor = iso(addDays(new Date(cursor + 'T00:00:00'), 1));
    }
  });
  return byDate;
}

/** Everyone off on each day of the range. Empty object while loading. */
export function useTimeOffByDate(from: Date, to: Date): Record<string, DayOff[]> {
  const fromKey = iso(from);
  const toKey = iso(to);

  const { data = {} } = useQuery({
    queryKey: ['time-off-by-date', fromKey, toKey],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => expand(await fetchTimeOffRange(fromKey, toKey), fromKey, toKey),
  });

  return data;
}
