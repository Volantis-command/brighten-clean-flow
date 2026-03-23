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
    .filter(j => j.price_ex_gst && j.price_ex_gst > 0 && ['scheduled', 'in_progress', 'complete'].includes(j.status))
    .reduce((s, j) => s + Number(j.price_ex_gst), 0);
  const completed = periodJobs.filter(j => j.status === 'complete').length;
  const pending = periodJobs.filter(j => j.status === 'awaiting_quote').length;

  const stats = [
    { label: 'Total Jobs', value: totalJobs, icon: '📋' },
    { label: 'Revenue', value: `$${revenue.toLocaleString()}`, icon: '💰' },
    { label: 'Completed', value: completed, icon: '✅' },
    { label: 'Pending', value: pending, icon: '⏳' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sticky top-0 z-10 bg-background pb-3">
      {stats.map(s => (
        <div key={s.label} className="bg-card rounded-xl shadow-sm p-3 flex items-center gap-3 border border-border/50">
          <span className="text-xl">{s.icon}</span>
          <div>
            <p className="text-xs font-bold text-muted-foreground">{s.label}</p>
            <p className="text-lg font-extrabold text-foreground">{s.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
