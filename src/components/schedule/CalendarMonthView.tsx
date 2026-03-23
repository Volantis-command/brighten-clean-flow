import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
import { getStatusColor } from './CalendarStatusColors';
import { cn } from '@/lib/utils';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CalendarMonthViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  onJobClick: (job: ScheduleJob) => void;
  onDateClick: (date: Date) => void;
}

export function CalendarMonthView({ date, jobs, nameMap, onJobClick, onDateClick }: CalendarMonthViewProps) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calDays: Date[] = [];
  let cursor = calStart;
  while (cursor <= calEnd) {
    calDays.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < calDays.length; i += 7) {
    weeks.push(calDays.slice(i, i + 7));
  }

  const jobsByDate = useMemo(() => {
    const map: Record<string, ScheduleJob[]> = {};
    jobs.forEach(j => {
      const key = j.scheduled_date;
      if (!map[key]) map[key] = [];
      map[key].push(j);
    });
    return map;
  }, [jobs]);

  // Month stats
  const monthJobs = useMemo(
    () => jobs.filter(j => {
      const d = new Date(j.scheduled_date + 'T00:00:00');
      return isSameMonth(d, date);
    }),
    [jobs, date]
  );
  const totalJobs = monthJobs.length;
  const revenue = monthJobs
    .filter(j => j.price_ex_gst && j.price_ex_gst > 0 && ['scheduled', 'in_progress', 'complete'].includes(j.status))
    .reduce((s, j) => s + Number(j.price_ex_gst), 0);
  const completed = monthJobs.filter(j => j.status === 'complete').length;
  const pending = monthJobs.filter(j => j.status === 'awaiting_quote').length;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Jobs', value: totalJobs, icon: '📋' },
          { label: 'Revenue', value: `$${revenue.toLocaleString()}`, icon: '💰' },
          { label: 'Completed', value: completed, icon: '✅' },
          { label: 'Pending', value: pending, icon: '⏳' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl shadow-sm p-3 flex items-center gap-3 border border-border/50">
            <span className="text-xl">{s.icon}</span>
            <div>
              <p className="text-xs font-bold text-muted-foreground">{s.label}</p>
              <p className="text-lg font-extrabold text-foreground">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-card rounded-2xl shadow-md overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-bold text-muted-foreground uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border/50 last:border-b-0">
            {week.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const dayJobs = jobsByDate[key] || [];
              const inMonth = isSameMonth(day, date);
              const today = isToday(day);
              const maxPills = 3;

              return (
                <button
                  key={key}
                  onClick={() => onDateClick(day)}
                  className={cn(
                    'min-h-[80px] md:min-h-[100px] p-1.5 border-r border-border/50 last:border-r-0 text-left transition-colors hover:bg-muted/30',
                    !inMonth && 'opacity-30',
                    today && 'bg-primary/5'
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mb-1',
                    today && 'bg-primary text-primary-foreground',
                    !today && 'text-foreground'
                  )}>
                    {format(day, 'd')}
                  </span>

                  <div className="space-y-0.5">
                    {dayJobs.slice(0, maxPills).map(job => {
                      const sc = getStatusColor(job.status);
                      const shortName = (job.properties?.property_name || 'Job').split(' ').slice(0, 2).join(' ');
                      return (
                        <div
                          key={job.id}
                          onClick={(e) => { e.stopPropagation(); onJobClick(job); }}
                          className={cn(
                            'text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80',
                            sc.bg, sc.text
                          )}
                        >
                          {shortName}
                        </div>
                      );
                    })}
                    {dayJobs.length > maxPills && (
                      <span className="text-[9px] font-bold text-primary pl-1">+{dayJobs.length - maxPills}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
