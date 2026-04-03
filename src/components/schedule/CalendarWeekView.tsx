import { useMemo, useCallback } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { getCleanerColor, getCleanerName } from './cleanerColors';
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

const HOURS = Array.from({ length: 13 }, (_, i) => i + 6); // 6am-6pm
const HOUR_HEIGHT = 64; // px per hour row

function parseTime(time: string | null): number {
  if (!time) return 8;
  const parts = time.split(':').map(Number);
  return parts[0] + (parts[1] || 0) / 60;
}

function getDurationHours(minutes: number | null): number {
  if (!minutes || minutes <= 0) return 1.5; // default visual block
  return Math.max(0.5, minutes / 60);
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function CalendarWeekView({ date, jobs, nameMap, acceptancesByJob, onJobClick, onDateClick, onAddJob, onJobDrop }: CalendarWeekViewProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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

  const totalHeight = HOURS.length * HOUR_HEIGHT;
  const firstHour = HOURS[0];

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-muted/30">
        <div className="border-r border-border" />
        {days.map(day => {
          const today = isToday(day);
          return (
            <button
              key={format(day, 'yyyy-MM-dd')}
              onClick={() => onDateClick(day)}
              className={cn(
                'flex flex-col items-center py-2.5 border-r border-border last:border-r-0 transition-colors',
                today && 'bg-primary/5'
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {format(day, 'EEE')}
              </span>
              <span className={cn(
                'text-xl font-extrabold mt-0.5 w-9 h-9 flex items-center justify-center rounded-full transition-colors',
                today ? 'bg-primary text-primary-foreground' : 'text-foreground'
              )}>
                {format(day, 'd')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[calc(100vh-280px)]" style={{ minHeight: '400px' }}>
        <div className="grid grid-cols-[56px_repeat(7,1fr)] relative" style={{ height: totalHeight }}>
          {/* Hour labels + horizontal lines */}
          <div className="relative border-r border-border">
            {HOURS.map((hour, i) => (
              <div
                key={hour}
                className="absolute right-0 w-full flex items-start justify-end pr-2"
                style={{ top: i * HOUR_HEIGHT }}
              >
                <span className="text-[10px] font-semibold text-muted-foreground -translate-y-1/2 tabular-nums">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayJobs = jobsByDay[key] || [];
            const today = isToday(day);

            return (
              <div
                key={key}
                className={cn(
                  'relative border-r border-border last:border-r-0',
                  today && 'bg-primary/[0.03]'
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, key)}
              >
                {/* Hour gridlines */}
                {HOURS.map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-border/40"
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}
                {/* Half-hour gridlines */}
                {HOURS.map((hour, i) => (
                  <div
                    key={`${hour}-half`}
                    className="absolute left-0 right-0 border-t border-border/20"
                    style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Click-to-add zones */}
                {HOURS.map((hour, i) => (
                  <button
                    key={`add-${hour}`}
                    className="absolute left-0 right-0 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-muted-foreground/40 hover:text-primary/40 z-0"
                    style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    onClick={() => onAddJob?.(day, hour)}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                ))}

                {/* Event blocks */}
                {dayJobs.map(job => {
                  const startTime = parseTime(job.scheduled_time);
                  const duration = getDurationHours(job.estimated_duration);
                  const top = (startTime - firstHour) * HOUR_HEIGHT;
                  const height = Math.max(duration * HOUR_HEIGHT, 28);
                  const cleanerName = getCleanerName(job.cleaner_1_id, nameMap);
                  const clientName = job.properties?.property_name || 'Job';
                  const address = job.properties?.address || '';

                  // Status-based colour coding
                  const isComplete = job.status === 'completed' || job.status === 'complete';
                  const isInProgress = job.status === 'in_progress';
                  const isCancelled = job.status === 'cancelled';
                  const statusBg = isComplete ? 'hsl(160 84% 39%)' : isInProgress ? 'hsl(38 92% 50%)' : isCancelled ? 'hsl(220 9% 64%)' : getCleanerColor(job.cleaner_1_id).bg;
                  const statusBorder = isComplete ? 'hsl(160 84% 30%)' : isInProgress ? 'hsl(38 92% 40%)' : isCancelled ? 'hsl(220 9% 54%)' : getCleanerColor(job.cleaner_1_id).border;
                  const statusText = (isComplete || isInProgress || isCancelled) ? '#fff' : getCleanerColor(job.cleaner_1_id).text;

                  return (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, job)}
                      onClick={() => onJobClick(job)}
                      className="absolute left-0.5 right-0.5 z-10 cursor-pointer rounded-lg overflow-hidden transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] group/event"
                      style={{
                        top: Math.max(top, 0),
                        height,
                        backgroundColor: statusBg,
                        borderLeft: `3px solid ${statusBorder}`,
                      }}
                    >
                      <div className="px-2 py-1 h-full flex flex-col justify-start overflow-hidden">
                        <p
                          className={`text-[11px] font-bold leading-tight truncate ${isCancelled ? 'line-through' : ''}`}
                          style={{ color: statusText }}
                        >
                          {clientName}
                        </p>
                        {height >= 44 && address && (
                          <p
                            className="text-[9px] leading-tight truncate mt-0.5 opacity-85"
                            style={{ color: statusText }}
                          >
                            {address}
                          </p>
                        )}
                        {height >= 56 && (
                          <p
                            className="text-[9px] leading-tight truncate mt-0.5 opacity-75"
                            style={{ color: statusText }}
                          >
                            {cleanerName.split(' ')[0]}
                            {job.scheduled_time ? ` · ${job.scheduled_time.slice(0, 5)}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Current time indicator */}
                {today && <CurrentTimeIndicator firstHour={firstHour} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CurrentTimeIndicator({ firstHour }: { firstHour: number }) {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const top = (currentHour - firstHour) * HOUR_HEIGHT;

  if (top < 0 || top > 13 * HOUR_HEIGHT) return null;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-destructive -ml-1 shrink-0" />
        <div className="flex-1 h-[2px] bg-destructive" />
      </div>
    </div>
  );
}
