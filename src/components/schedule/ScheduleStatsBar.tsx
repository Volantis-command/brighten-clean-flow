import { useMemo } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isWithinInterval } from 'date-fns';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';
import type { CalendarView } from './CalendarViewToggle';

interface ScheduleStatsBarProps {
  view: CalendarView;
  date: Date;
  jobs: ScheduleJob[];
}

export function ScheduleStatsBar({ view, date, jobs }: ScheduleStatsBarProps) {
  const periodJobs = useMemo(() => {
    return jobs.filter(j => {
      const d = new Date(j.scheduled_date + 'T00:00:00');
      if (view === 'day') return isSameDay(d, date);
      if (view === 'week') {
        const ws = startOfWeek(date, { weekStartsOn: 1 });
        const we = endOfWeek(date, { weekStartsOn: 1 });
        return isWithinInterval(d, { start: ws, end: we });
      }
      const ms = startOfMonth(date);
      const me = endOfMonth(date);
      return isWithinInterval(d, { start: ms, end: me });
    });
  }, [jobs, date, view]);

  const totalJobs = periodJobs.length;
  const revenue = periodJobs
    .filter(j => j.price_ex_gst && j.price_ex_gst > 0 && ['scheduled', 'confirmed', 'in_progress', 'completed'].includes(j.status))
    .reduce((s, j) => s + Number(j.price_ex_gst), 0);
  const completed = periodJobs.filter(j => j.status === 'completed').length;
  const inProgress = periodJobs.filter(j => j.status === 'in_progress').length;

  return (
    <p className="text-sm text-muted-foreground font-medium">
      <span>{totalJobs} job{totalJobs !== 1 ? 's' : ''}</span>
      <span className="mx-1.5 opacity-40">·</span>
      <span>${revenue.toLocaleString()} revenue</span>
      <span className="mx-1.5 opacity-40">·</span>
      <span>{completed} completed</span>
      <span className="mx-1.5 opacity-40">·</span>
      <span>{inProgress} in progress</span>
    </p>
  );
}
