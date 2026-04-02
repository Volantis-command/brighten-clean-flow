import { useMemo, useCallback } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { getCleanerColor, getCleanerName } from './cleanerColors';
import { Plus } from 'lucide-react';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CalendarDayViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  acceptancesByJob: Record<string, any[]>;
  onJobClick: (job: ScheduleJob) => void;
  onAddJob?: (date: Date, hour?: number) => void;
  onJobDrop?: (job: ScheduleJob, newDate: string, newTime?: string) => void;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 6); // 6am-6pm
const HOUR_HEIGHT = 72; // taller rows for day view

function parseTime(time: string | null): number {
  if (!time) return 8;
  const parts = time.split(':').map(Number);
  return parts[0] + (parts[1] || 0) / 60;
}

function getDurationHours(minutes: number | null): number {
  if (!minutes || minutes <= 0) return 1.5;
  return Math.max(0.5, minutes / 60);
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function CalendarDayView({ date, jobs, nameMap, acceptancesByJob, onJobClick, onAddJob, onJobDrop }: CalendarDayViewProps) {
  const dayJobs = useMemo(
    () => jobs.filter(j => isSameDay(new Date(j.scheduled_date + 'T00:00:00'), date)),
    [jobs, date]
  );

  const dateStr = format(date, 'yyyy-MM-dd');
  const today = isToday(date);
  const firstHour = HOURS[0];
  const totalHeight = HOURS.length * HOUR_HEIGHT;

  const handleDragStart = useCallback((e: React.DragEvent, job: ScheduleJob) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ jobId: job.id }));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, hour: number) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const job = jobs.find(j => j.id === data.jobId);
      if (job && onJobDrop) {
        const newTime = `${String(hour).padStart(2, '0')}:00:00`;
        onJobDrop(job, dateStr, newTime);
      }
    } catch {}
  }, [jobs, onJobDrop, dateStr]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h2 className="text-lg font-extrabold text-foreground">
          {format(date, 'EEEE, d MMMM yyyy')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''} scheduled
        </p>
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[calc(100vh-300px)]" style={{ minHeight: '400px' }}>
        <div className="grid grid-cols-[72px_1fr] relative" style={{ height: totalHeight }}>
          {/* Hour labels */}
          <div className="relative border-r border-border">
            {HOURS.map((hour, i) => (
              <div
                key={hour}
                className="absolute right-0 w-full flex items-start justify-end pr-3"
                style={{ top: i * HOUR_HEIGHT }}
              >
                <span className="text-[11px] font-semibold text-muted-foreground -translate-y-1/2 tabular-nums">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div
            className="relative"
            onDragOver={handleDragOver}
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
                className="absolute left-0 right-0 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-muted-foreground/30 hover:text-primary/40 z-0"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                onClick={() => onAddJob?.(date, hour)}
                onDrop={(e) => handleDrop(e, hour)}
                onDragOver={handleDragOver}
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="text-xs font-semibold">Add job</span>
              </button>
            ))}

            {/* Event blocks */}
            {dayJobs.map(job => {
              const startTime = parseTime(job.scheduled_time);
              const duration = getDurationHours(job.estimated_duration);
              const top = (startTime - firstHour) * HOUR_HEIGHT;
              const height = Math.max(duration * HOUR_HEIGHT, 36);
              const color = getCleanerColor(job.cleaner_1_id);
              const cleanerName = getCleanerName(job.cleaner_1_id, nameMap);
              const clientName = job.properties?.property_name || 'Job';
              const address = job.properties?.address || '';

              return (
                <div
                  key={job.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, job)}
                  onClick={() => onJobClick(job)}
                  className="absolute left-1 right-4 z-10 cursor-pointer rounded-lg overflow-hidden transition-all hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    top: Math.max(top, 0),
                    height,
                    backgroundColor: color.bg,
                    borderLeft: `4px solid ${color.border}`,
                  }}
                >
                  <div className="px-3 py-1.5 h-full flex flex-col justify-start overflow-hidden">
                    <p className="text-sm font-bold leading-tight truncate" style={{ color: color.text }}>
                      {clientName}
                    </p>
                    {height >= 52 && address && (
                      <p className="text-xs leading-tight truncate mt-0.5 opacity-85" style={{ color: color.text }}>
                        📍 {address}
                      </p>
                    )}
                    {height >= 68 && (
                      <p className="text-xs leading-tight truncate mt-0.5 opacity-75" style={{ color: color.text }}>
                        👤 {cleanerName}
                        {job.scheduled_time ? ` · ${job.scheduled_time.slice(0, 5)}` : ''}
                        {job.estimated_duration ? ` · ${job.estimated_duration / 60}hr` : ''}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Current time indicator */}
            {today && <CurrentTimeIndicator firstHour={firstHour} hourHeight={HOUR_HEIGHT} totalHours={HOURS.length} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentTimeIndicator({ firstHour, hourHeight, totalHours }: { firstHour: number; hourHeight: number; totalHours: number }) {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const top = (currentHour - firstHour) * hourHeight;

  if (top < 0 || top > totalHours * hourHeight) return null;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-3 h-3 rounded-full bg-destructive -ml-1.5 shrink-0" />
        <div className="flex-1 h-[2px] bg-destructive" />
      </div>
    </div>
  );
}
