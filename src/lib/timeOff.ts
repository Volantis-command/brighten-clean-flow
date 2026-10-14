// ============================================================================
// Time off (staff_leave).
//
// A row here makes someone unavailable for those dates, so scheduling refuses
// to put them on a job without an admin override (cleaner_is_available_on_date
// reads this table). It is the one place "Jess is away" lives.
// ============================================================================

import { addDays, format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface TimeOff {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  /** Jobs still assigned to them inside this stretch. Needs covering. */
  clashingJobs: number;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Reads like a person would say it: "23 to 25 Oct", "Sat 8 Nov". */
export function timeOffLabel(leave: { start_date: string; end_date: string }): string {
  const from = parseISO(leave.start_date);
  const to = parseISO(leave.end_date);
  if (leave.start_date === leave.end_date) return format(from, 'EEE d MMM');
  const sameMonth = format(from, 'MMM yyyy') === format(to, 'MMM yyyy');
  return sameMonth
    ? `${format(from, 'd')} to ${format(to, 'd MMM')}`
    : `${format(from, 'd MMM')} to ${format(to, 'd MMM')}`;
}

export function isOnDate(leave: { start_date: string; end_date: string }, date: string): boolean {
  return leave.start_date <= date && leave.end_date >= date;
}

/** Everyone off between today and `days` ahead, soonest first. */
export async function fetchTimeOff(days = 35): Promise<TimeOff[]> {
  const today = iso(new Date());
  const until = iso(addDays(new Date(), days));

  const { data: leave, error } = await supabase
    .from('staff_leave')
    .select('id, user_id, start_date, end_date, reason')
    .gte('end_date', today)
    .lte('start_date', until)
    .order('start_date', { ascending: true });
  if (error) throw new Error(`Could not load time off: ${error.message}`);

  const rows = (leave as any[]) || [];
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: people }, { data: jobs }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', ids),
    // Anything still on their name during leave is work that needs moving.
    supabase
      .from('jobs')
      .select('id, scheduled_date, cleaner_1_id, cleaner_2_id')
      .gte('scheduled_date', today)
      .lte('scheduled_date', until)
      .not('status', 'in', '(cancelled,completed)')
      .or(`cleaner_1_id.in.(${ids.join(',')}),cleaner_2_id.in.(${ids.join(',')})`),
  ]);

  const names = new Map(((people as any[]) || []).map((p) => [p.id, p.full_name || 'Unnamed cleaner']));

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    name: names.get(r.user_id) || 'Unnamed cleaner',
    start_date: r.start_date,
    end_date: r.end_date,
    reason: r.reason,
    clashingJobs: ((jobs as any[]) || []).filter(
      (j) => (j.cleaner_1_id === r.user_id || j.cleaner_2_id === r.user_id) && isOnDate(r, j.scheduled_date),
    ).length,
  }));
}

export async function addTimeOff(userId: string, start: string, end: string, reason: string) {
  const { error } = await supabase
    .from('staff_leave')
    .insert({ user_id: userId, start_date: start, end_date: end, reason: reason || 'Time off' } as any);
  if (error) throw new Error(`Could not save the time off: ${error.message}`);
}

export async function removeTimeOff(id: string) {
  const { error } = await supabase.from('staff_leave').delete().eq('id', id);
  if (error) throw new Error(`Could not remove the time off: ${error.message}`);
}
