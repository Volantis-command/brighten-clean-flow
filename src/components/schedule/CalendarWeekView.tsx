import { useMemo, useCallback } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { CalendarJobCard } from './CalendarJobCard';
import { getStatusColor } from './CalendarStatusColors';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CalendarWeekViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  acceptancesByJob: Record<string, any[]>;
  onJobClick: (job: ScheduleJob) => void;
  onDateClick: (date: Date) => void;
  onAddJob?: (date: Date, hour?: number) => void;
  onJobDrop?: (job: ScheduleJob, newDate: string, newTime?: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am-6pm

function getTimeSlot(time: string | null): number {
  if (!time) return 8;
  const [h] = time.split(':').map(Number);
  return Math.max(7, Math.min(h, 18));
}

export function CalendarWeekView({ date, jobs, nameMap, acceptancesByJob, onJobClick, onDateClick, onAddJob, onJobDrop }: CalendarWeekViewProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const jobsByDayHour = useMemo(() => {
    const map: Record<string, Record<number, ScheduleJob[]>> = {};
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      map[key] = {};
      HOURS.forEach(h => { map[key][h] = []; });
    });
    jobs.forEach(j => {
      const jd = new Date(j.scheduled_date + 'T00:00:00');
      const dayMatch = days.find(d => isSameDay(d, jd));
      if (!dayMatch) return;
      const key = format(dayMatch, 'yyyy-MM-dd');
      const h = getTimeSlot(j.scheduled_time);
      if (map[key]?.[h]) map[key][h].push(j);
    });
    return map;
  }, [jobs, days]);

  const jobsByDay = useMemo(() => {
    const map: Record<string, ScheduleJob[]> = {};
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      map[key] = jobs.filter(j => isSameDay(new Date(j.scheduled_date + 'T00:00:00'), d));
    });
    return map;
  }, [jobs, days]);

  const handleDragStart = useCallback((e: React.DragEvent, job: ScheduleJob) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ jobId: job.id }));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dayKey: string, hour?: number) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const job = jobs.find(j => j.id === data.jobId);
      if (job && onJobDrop) {
        const newTime = hour !== undefined ? `${String(hour).padStart(2, '0')}:00:00` : undefined;
        onJobDrop(job, dayKey, newTime);
      }
    } catch {}
  }, [jobs, onJobDrop]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="bg-card rounded-2xl shadow-md overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
        <div className="border-r border-border/50" />
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

      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto">
        {HOURS.map(hour => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border/30 min-h-[56px]">
            {/* Time label */}
            <div className="py-2 px-2 text-[10px] font-bold text-muted-foreground text-right border-r border-border/50 flex items-start justify-end">
              {hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const hourJobs = jobsByDayHour[key]?.[hour] || [];

              return (
                <div
                  key={`${key}-${hour}`}
                  className={cn(
                    'border-r border-border/30 last:border-r-0 p-0.5 group/cell relative',
                    isToday(day) && 'bg-primary/[0.02]'
                  )}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, key, hour)}
                >
                  {hourJobs.length > 0 ? (
                    <div className="space-y-0.5">
                      {hourJobs.map(job => (
                        <div
                          key={job.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, job)}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <CalendarJobCard
                            job={job}
                            nameMap={nameMap}
                            acceptances={acceptancesByJob[job.id]}
                            compact
                            onClick={() => onJobClick(job)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => onAddJob?.(day, hour)}
                      className="w-full h-full min-h-[48px] flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity rounded border border-dashed border-border/40 text-muted-foreground/50 hover:border-primary/30 hover:text-primary"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
