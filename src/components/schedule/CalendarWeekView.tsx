import { useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { CalendarJobCard } from './CalendarJobCard';
import { getStatusColor } from './CalendarStatusColors';
import { cn } from '@/lib/utils';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CalendarWeekViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  acceptancesByJob: Record<string, any[]>;
  onJobClick: (job: ScheduleJob) => void;
  onDateClick: (date: Date) => void;
}

export function CalendarWeekView({ date, jobs, nameMap, acceptancesByJob, onJobClick, onDateClick }: CalendarWeekViewProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const jobsByDay = useMemo(() => {
    const map: Record<string, ScheduleJob[]> = {};
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      map[key] = jobs.filter(j => isSameDay(new Date(j.scheduled_date + 'T00:00:00'), d))
        .sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''));
    });
    return map;
  }, [jobs, days]);

  return (
    <div className="bg-card rounded-2xl shadow-md overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDay[key] || [];
          const today = isToday(day);
          const selected = isSameDay(day, date);

          return (
            <button
              key={key}
              onClick={() => onDateClick(day)}
              className={cn(
                'flex flex-col items-center py-3 px-1 border-r border-border/50 last:border-r-0 transition-colors',
                today && 'bg-primary/5',
                selected && 'bg-primary/10'
              )}
            >
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                {format(day, 'EEE')}
              </span>
              <span className={cn(
                'text-lg font-extrabold w-9 h-9 flex items-center justify-center rounded-full',
                today && 'bg-primary text-primary-foreground',
                selected && !today && 'bg-accent text-accent-foreground'
              )}>
                {format(day, 'd')}
              </span>
              {/* Status dots */}
              {dayJobs.length > 0 && (
                <div className="flex items-center gap-0.5 mt-1">
                  {dayJobs.slice(0, 5).map(j => (
                    <span key={j.id} className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(j.status).dot)} />
                  ))}
                  {dayJobs.length > 5 && (
                    <span className="text-[8px] font-bold text-muted-foreground">+{dayJobs.length - 5}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Job cards grid */}
      <div className="grid grid-cols-7 min-h-[400px]">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDay[key] || [];
          const showCount = 3;
          const visible = dayJobs.slice(0, showCount);
          const remaining = dayJobs.length - showCount;

          return (
            <div
              key={key}
              className={cn(
                'border-r border-border/50 last:border-r-0 p-2 space-y-1.5 min-h-[200px]',
                isToday(day) && 'bg-primary/[0.02]'
              )}
            >
              {dayJobs.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground/40">—</span>
                </div>
              ) : (
                <>
                  {visible.map(job => (
                    <CalendarJobCard
                      key={job.id}
                      job={job}
                      nameMap={nameMap}
                      acceptances={acceptancesByJob[job.id]}
                      compact
                      onClick={() => onJobClick(job)}
                    />
                  ))}
                  {remaining > 0 && (
                    <button
                      onClick={() => onDateClick(day)}
                      className="w-full text-center text-[10px] font-bold text-primary py-1 rounded-lg hover:bg-primary/10 transition-colors"
                    >
                      +{remaining} more
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
