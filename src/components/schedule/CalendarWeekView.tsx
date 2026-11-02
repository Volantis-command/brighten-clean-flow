import { useMemo, useCallback } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { getCleanerColor, getCleanerName } from './cleanerColors';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';
import { jobLabel } from '@/lib/jobLabel';
import { jobCleaners, teamLabel } from '@/lib/jobCleaners';
import { TeamSplit } from './TeamSplit';
import { jobClosure } from '@/lib/jobClosure';
import { ClosedTick, ActionChip, CLOSED_BG, CLOSED_BORDER, CLOSED_TEXT } from './ClosedTick';
import type { DayOff } from '@/hooks/useTimeOff';
import { TimeOffChips } from './TimeOffChips';

interface CalendarWeekViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  acceptancesByJob: Record<string, any[]>;
  onJobClick: (job: ScheduleJob) => void;
  onDateClick: (date: Date) => void;
  onAddJob?: (date: Date, hour?: number) => void;
  onJobDrop?: (job: ScheduleJob, newDate: string, newTime?: string) => void;
  /** Who is off, by date. The day is marked so nobody books into it. */
  timeOffByDate?: Record<string, DayOff[]>;
}

const DAY_START = 6;      // 6am
const DAY_END_MIN = 18;   // normally draw through to 6pm

// Same reason as the day view: a fixed 6am-6pm grid clipped long jobs off the
// bottom, so a full-day clean looked wrong or vanished. Stretch to the latest
// finish in the week, and only when something actually runs late.
function buildHours(jobs: { scheduled_time: string | null; estimated_duration: number | null }[]) {
  let end = DAY_END_MIN;
  for (const j of jobs) {
    const finish = parseTime(j.scheduled_time) + getDurationHours(j.estimated_duration);
    if (finish > end) end = Math.ceil(finish);
  }
  end = Math.min(end, 24);
  return Array.from({ length: end - DAY_START + 1 }, (_, i) => i + DAY_START);
}
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

/**
 * Compute side-by-side column layout for overlapping jobs within a day.
 * Returns a map of jobId → { col, totalCols } so each job can be
 * positioned as left=(col/totalCols)*100%, width=(1/totalCols)*100%.
 */
function computeLayout(jobs: ScheduleJob[]): Record<string, { col: number; totalCols: number }> {
  if (jobs.length <= 1) {
    const result: Record<string, { col: number; totalCols: number }> = {};
    jobs.forEach(j => { result[j.id] = { col: 0, totalCols: 1 }; });
    return result;
  }

  const items = jobs.map(j => ({
    id: j.id,
    start: parseTime(j.scheduled_time),
    end: parseTime(j.scheduled_time) + getDurationHours(j.estimated_duration),
    col: 0,
    totalCols: 1,
  }));

  // Sort by start time, then by longer duration first (fills columns more cleanly)
  items.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  // Assign each job to the first column it doesn't overlap with
  const colEnds: number[] = [];
  items.forEach(item => {
    let col = 0;
    while (colEnds[col] !== undefined && colEnds[col] > item.start + 0.02) col++;
    item.col = col;
    colEnds[col] = item.end;
  });

  // For each job, totalCols = max column index of any job that overlaps with it, + 1
  items.forEach(item => {
    let maxCol = item.col;
    items.forEach(other => {
      if (other.id !== item.id) {
        const overlaps = item.start < other.end - 0.02 && other.start < item.end - 0.02;
        if (overlaps && other.col > maxCol) maxCol = other.col;
      }
    });
    item.totalCols = maxCol + 1;
  });

  const result: Record<string, { col: number; totalCols: number }> = {};
  items.forEach(item => { result[item.id] = { col: item.col, totalCols: item.totalCols }; });
  return result;
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function CalendarWeekView({ date, jobs, nameMap, acceptancesByJob, onJobClick, onDateClick, onAddJob, onJobDrop, timeOffByDate }: CalendarWeekViewProps) {
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

  // Side-by-side layout for overlapping jobs within each day
  const layoutByDay = useMemo(() => {
    const result: Record<string, Record<string, { col: number; totalCols: number }>> = {};
    Object.entries(jobsByDay).forEach(([day, dayJobs]) => {
      result[day] = computeLayout(dayJobs);
    });
    return result;
  }, [jobsByDay]);

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

  const HOURS = useMemo(() => buildHours(Object.values(jobsByDay).flat()), [jobsByDay]);
  const totalHeight = HOURS.length * HOUR_HEIGHT;
  const firstHour = HOURS[0];

  return (
    <div className="flex h-full min-h-[400px] flex-col bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
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
              <TimeOffChips off={timeOffByDate?.[format(day, 'yyyy-MM-dd')]} />
            </button>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                  today && 'bg-primary/[0.03]',
                  // Somebody is away: the whole column is tinted, so a gap in
                  // the week reads as "nobody to book" at a glance.
                  (timeOffByDate?.[key]?.length ?? 0) > 0 && 'bg-amber-500/[0.06]'
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
                  const { col = 0, totalCols = 1 } = layoutByDay[key]?.[job.id] || {};
                  const GAP = 2; // px gap between columns
                  const colWidthPct = 100 / totalCols;
                  const leftPct = col * colWidthPct;
                  const team = jobCleaners(job, nameMap);
                  const isTeamJob = team.length > 1;
                  const clientName = jobLabel(job);
                  const address = job.properties?.address || '';
                  const isAirbnb = job.properties?.client_type === 'airbnb';
                  const isFirstClean = job.properties?.first_clean === true;
                  const isRecurring = !!job.series_id || !!job.recurring_parent_id || (job.frequency && job.frequency !== 'one-off');
                  // One clean, however many cleaners. The block splits into a band
                  // each (TeamSplit); this line is the fallback for short blocks.
                  const cleanerStr = team.length ? teamLabel(team) : null;

                  // Status-based colour coding
                  // yellow=needs cleaner, green=confirmed, blue=in progress
                  // grey=done/no invoice, orange=draft in Xero, purple=invoice sent, emerald=paid
                  const isComplete = job.status === 'completed';
                  const isInProgress = job.status === 'in_progress';
                  const isCancelled = job.status === 'cancelled' || job.status === 'flagged';
                  const isPending = job.status === 'pending_cleaner' || job.status === 'awaiting_cleaner_acceptance' || job.status === 'awaiting_quote';
                  const invoiceSt = job.invoice_status;
                  const isPaid = isComplete && invoiceSt === 'paid';
                  const isSent = isComplete && (invoiceSt === 'sent' || invoiceSt === 'authorised');
                  const isDraft = isComplete && invoiceSt === 'draft';
                  const statusBg = isPending ? 'hsl(45 93% 58%)' : isPaid ? 'hsl(142 60% 38%)' : isSent ? 'hsl(270 55% 58%)' : isDraft ? 'hsl(28 85% 58%)' : isComplete ? 'hsl(220 9% 70%)' : isInProgress ? 'hsl(217 91% 60%)' : isCancelled ? 'hsl(0 72% 51%)' : 'hsl(160 84% 39%)';
                  const statusBorder = isPending ? 'hsl(45 93% 45%)' : isPaid ? 'hsl(142 60% 28%)' : isSent ? 'hsl(270 55% 42%)' : isDraft ? 'hsl(28 85% 45%)' : isComplete ? 'hsl(220 9% 55%)' : isInProgress ? 'hsl(217 91% 48%)' : isCancelled ? 'hsl(0 72% 41%)' : 'hsl(160 84% 30%)';
                  const statusText = isPending ? '#422006' : '#fff';

                  // Awaiting BJ's approval. Orange and dashed, because yellow
                  // already means 'needs a cleaner' on 205 jobs.
                  const awaitingApproval = (job as any).approval_status === 'pending';

                  // Finished with: the block steps back so only the cleans that
                  // still want something from you hold your eye.
                  const closure = jobClosure(job);
                  const settled = closure.closed && isComplete;

                  return (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, job)}
                      onClick={() => onJobClick(job)}
                      className="absolute z-10 cursor-pointer rounded-lg overflow-hidden transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] group/event"
                      style={{
                        top: Math.max(top, 0),
                        height,
                        left: `calc(${leftPct}% + ${GAP}px)`,
                        width: `calc(${colWidthPct}% - ${GAP * 2}px)`,
                        backgroundColor: settled ? CLOSED_BG : awaitingApproval ? 'hsl(24 95% 53%)' : statusBg,
                        borderLeft: `3px ${awaitingApproval && !settled ? 'dashed' : 'solid'} ${settled ? CLOSED_BORDER : awaitingApproval ? 'hsl(24 95% 35%)' : statusBorder}`,
                        outline: awaitingApproval ? '2px dashed hsl(24 95% 35%)' : undefined,
                        outlineOffset: awaitingApproval ? '-3px' : undefined,
                      }}
                    >
                      {isTeamJob && <TeamSplit team={team} height={height} textColor={statusText} />}
                      {settled && <ClosedTick reason={closure.reason} size={height >= 56 ? 'md' : 'sm'} />}
                      {closure.chip && <ActionChip label={closure.chip} tone={closure.tone} compact />}
                      <div className="relative px-2 py-1 h-full flex flex-col justify-start overflow-hidden">
                        {/* Line 1: name + indicator icons */}
                        <div className="flex items-center gap-1 min-w-0">
                          <p
                            className={`text-[11px] font-bold leading-tight truncate flex-1 min-w-0 ${isCancelled ? 'line-through' : ''}`}
                            style={{ color: settled ? CLOSED_TEXT : statusText }}
                            title={clientName}
                          >
                            {clientName}
                          </p>
                          <span className="flex items-center gap-0.5 shrink-0" style={{ color: settled ? CLOSED_TEXT : statusText }}>
                            {isRecurring && <span className="text-[9px]" title="Recurring">🔁</span>}
                            {isAirbnb && <span className="text-[9px]" title="Airbnb / short-stay">🏠</span>}
                            {isFirstClean && <span className="text-[9px]" title="First clean">⭐</span>}
                          </span>
                        </div>
                        {/* Line 2: time always shown if there's room */}
                        {height >= 32 && job.scheduled_time && (
                          <p
                            className="text-[9px] leading-tight truncate mt-0.5 font-semibold"
                            style={{ color: settled ? CLOSED_TEXT : statusText, opacity: 0.85 }}
                          >
                            {job.scheduled_time.slice(0, 5)}
                            {duration ? ` · ${duration}hr` : ''}
                          </p>
                        )}
                        {/* Line 3: address */}
                        {height >= 48 && address && (
                          <p
                            className="text-[9px] leading-tight truncate mt-0.5"
                            style={{ color: settled ? CLOSED_TEXT : statusText, opacity: 0.8 }}
                            title={address}
                          >
                            📍 {address}
                          </p>
                        )}
                        {/* Line 4: cleaners. A team job already names them on each
                            band, so this only repeats for a single cleaner. */}
                        {height >= 64 && cleanerStr && !isTeamJob && (
                          <p
                            className="text-[9px] leading-tight truncate mt-0.5"
                            style={{ color: settled ? CLOSED_TEXT : statusText, opacity: 0.8 }}
                          >
                            👤 {cleanerStr}
                          </p>
                        )}
                        {isTeamJob && height >= 40 && height < 64 && (
                          <p className="text-[9px] font-bold leading-tight truncate mt-0.5" style={{ color: settled ? CLOSED_TEXT : statusText, opacity: .9 }}>
                            👥 {team.length} cleaners
                          </p>
                        )}
                        {height >= 64 && !cleanerStr && !isTeamJob && (
                          <p
                            className="text-[9px] leading-tight truncate mt-0.5 italic"
                            style={{ color: settled ? CLOSED_TEXT : statusText, opacity: 0.7 }}
                          >
                            No cleaner assigned
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
