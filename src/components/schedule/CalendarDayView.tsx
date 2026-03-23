import { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { CalendarJobCard } from './CalendarJobCard';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';
import { cn } from '@/lib/utils';

interface CalendarDayViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  acceptancesByJob: Record<string, any[]>;
  onJobClick: (job: ScheduleJob) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am-6pm

function getTimeSlot(time: string | null): number {
  if (!time) return 8;
  const [h] = time.split(':').map(Number);
  return h;
}

function getDurationSlots(minutes: number | null): number {
  if (!minutes || minutes <= 0) return 2; // default 1hr = 2 half-hour slots
  return Math.max(1, Math.round(minutes / 30));
}

export function CalendarDayView({ date, jobs, nameMap, acceptancesByJob, onJobClick }: CalendarDayViewProps) {
  const navigate = useNavigate();

  const dayJobs = useMemo(
    () => jobs.filter(j => isSameDay(new Date(j.scheduled_date + 'T00:00:00'), date)),
    [jobs, date]
  );

  // Group jobs by hour slot
  const jobsByHour = useMemo(() => {
    const map: Record<number, ScheduleJob[]> = {};
    dayJobs.forEach(j => {
      const h = getTimeSlot(j.scheduled_time);
      if (!map[h]) map[h] = [];
      map[h].push(j);
    });
    return map;
  }, [dayJobs]);

  // Track which hour slots are occupied by multi-hour jobs
  const occupiedSlots = useMemo(() => {
    const set = new Set<number>();
    dayJobs.forEach(j => {
      const startH = getTimeSlot(j.scheduled_time);
      const durationHours = j.estimated_duration ? Math.ceil(j.estimated_duration / 60) : 1;
      for (let i = 1; i < durationHours; i++) {
        set.add(startH + i);
      }
    });
    return set;
  }, [dayJobs]);

  return (
    <div className="bg-card rounded-2xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 px-4 py-3 border-b border-border">
        <h2 className="text-lg font-extrabold text-primary">
          {format(date, 'EEEE, d MMMM yyyy')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''} scheduled
        </p>
      </div>

      {/* Time grid */}
      <div className="divide-y divide-border/50">
        {HOURS.map(hour => {
          const hourJobs = jobsByHour[hour] || [];
          const isOccupied = occupiedSlots.has(hour);
          const formattedHour = hour <= 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
          if (hour === 12) {
            // Special case
          }

          if (isOccupied && hourJobs.length === 0) return null;

          return (
            <div key={hour} className="flex min-h-[64px] group/slot">
              {/* Time label */}
              <div className="w-20 shrink-0 py-3 px-3 text-xs font-bold text-muted-foreground text-right border-r border-border/50">
                {hour === 12 ? '12:00 PM' : hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`}
              </div>

              {/* Job area */}
              <div className="flex-1 py-2 px-3 relative">
                {hourJobs.length > 0 ? (
                  <div className="space-y-2">
                    {hourJobs.map(job => (
                      <div
                        key={job.id}
                        style={{
                          minHeight: `${getDurationSlots(job.estimated_duration) * 32}px`,
                        }}
                      >
                        <CalendarJobCard
                          job={job}
                          nameMap={nameMap}
                          acceptances={acceptancesByJob[job.id]}
                          onClick={() => onJobClick(job)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => navigate('/schedule/new')}
                    className="w-full h-full min-h-[48px] flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity rounded-lg border-2 border-dashed border-border/50 text-muted-foreground hover:border-primary/30 hover:text-primary"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    <span className="text-xs font-bold">Add job</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
