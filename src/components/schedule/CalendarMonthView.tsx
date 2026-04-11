import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
import { getCleanerColor } from './cleanerColors';
import { cn } from '@/lib/utils';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CalendarMonthViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  onJobClick: (job: ScheduleJob) => void;
  onDateClick: (date: Date) => void;
  onAddJob?: (date: Date) => void;
  onJobDrop?: (job: ScheduleJob, newDate: string) => void;
}

export function CalendarMonthView({ date, jobs, nameMap, onJobClick, onDateClick, onAddJob, onJobDrop }: CalendarMonthViewProps) {
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const job = jobs.find(j => j.id === data.jobId);
      if (job && onJobDrop) {
        onJobDrop(job, dayKey);
      }
    } catch {}
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
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
              <div
                key={key}
                className={cn(
                  'min-h-[80px] md:min-h-[100px] p-1.5 border-r border-border/50 last:border-r-0 text-left transition-colors group/cell',
                  !inMonth && 'opacity-30',
                  today && 'bg-primary/5'
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, key)}
              >
                <button
                  onClick={() => onDateClick(day)}
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mb-1',
                    today && 'bg-primary text-primary-foreground',
                    !today && 'text-foreground hover:bg-muted'
                  )}
                >
                  {format(day, 'd')}
                </button>

                <div className="space-y-0.5">
                  {dayJobs.slice(0, maxPills).map(job => {
                    const shortName = (job.properties?.property_name || 'Job').split(' ').slice(0, 2).join(' ');
                    const isComplete = job.status === 'completed' || job.status === 'complete';
                    const isInProgress = job.status === 'in_progress';
                    const isCancelled = job.status === 'cancelled' || job.status === 'flagged';
                    const isPending = job.status === 'pending_approval' || job.status === 'awaiting_schedule_approval' || job.status === 'awaiting_quote' || job.status === 'awaiting_approval';
                    const pillBg = isPending ? 'hsl(45 93% 88%)' : isComplete ? 'hsl(220 9% 90%)' : isInProgress ? 'hsl(217 91% 90%)' : isCancelled ? 'hsl(0 72% 90%)' : 'hsl(160 84% 88%)';
                    const pillText = isPending ? 'hsl(45 93% 30%)' : isComplete ? 'hsl(220 9% 40%)' : isInProgress ? 'hsl(217 91% 40%)' : isCancelled ? 'hsl(0 72% 35%)' : 'hsl(160 84% 25%)';
                    const pillBorder = isPending ? 'hsl(45 93% 58%)' : isComplete ? 'hsl(220 9% 70%)' : isInProgress ? 'hsl(217 91% 60%)' : isCancelled ? 'hsl(0 72% 51%)' : 'hsl(160 84% 39%)';
                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({ jobId: job.id }));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={(e) => { e.stopPropagation(); onJobClick(job); }}
                        className={`text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded truncate cursor-grab active:cursor-grabbing hover:opacity-80 ${isCancelled ? 'line-through' : ''}`}
                        style={{
                          backgroundColor: pillBg,
                          color: pillText,
                          borderLeft: `2px solid ${pillBorder}`,
                        }}
                      >
                        {shortName}
                      </div>
                    );
                  })}
                  {dayJobs.length > maxPills && (
                    <span className="text-[9px] font-bold text-primary pl-1">+{dayJobs.length - maxPills}</span>
                  )}
                  {dayJobs.length === 0 && inMonth && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAddJob?.(day); }}
                      className="w-full text-center opacity-0 group-hover/cell:opacity-100 transition-opacity text-[9px] text-muted-foreground/50 hover:text-primary py-1"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
