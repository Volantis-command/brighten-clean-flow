import { useMemo } from 'react';
import { addDays, format, isToday } from 'date-fns';
import { AlertTriangle, CalendarPlus, CheckCircle2, Clock3, MapPin, Sparkles, UserRound } from 'lucide-react';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';
import { jobLabel } from '@/lib/jobLabel';

interface CalendarAgendaViewProps {
  date: Date;
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
  onJobClick: (job: ScheduleJob) => void;
  onAddJob: (date: Date) => void;
}

const ACTIVE_STATUSES = new Set(['pending_cleaner', 'awaiting_cleaner_acceptance', 'scheduled', 'confirmed', 'in_progress', 'completed', 'pending_suggestion']);

function statusMeta(status: string) {
  if (status === 'completed') return { label: 'Guest ready', icon: CheckCircle2, className: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25' };
  if (status === 'in_progress') return { label: 'Underway', icon: Sparkles, className: 'text-blue-400 bg-blue-400/10 border-blue-400/25' };
  if (status === 'pending_cleaner') return { label: 'Needs cleaner', icon: AlertTriangle, className: 'text-amber-400 bg-amber-400/10 border-amber-400/25' };
  if (status === 'awaiting_cleaner_acceptance') return { label: 'Awaiting cleaner', icon: Clock3, className: 'text-orange-400 bg-orange-400/10 border-orange-400/25' };
  if (status === 'pending_suggestion') return { label: 'Review booking', icon: AlertTriangle, className: 'text-violet-400 bg-violet-400/10 border-violet-400/25' };
  return { label: 'Scheduled', icon: Clock3, className: 'text-primary bg-primary/10 border-primary/25' };
}

export function CalendarAgendaView({ date, jobs, nameMap, onJobClick, onAddJob }: CalendarAgendaViewProps) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(date, index)), [date]);
  const jobsByDate = useMemo(() => {
    const grouped: Record<string, ScheduleJob[]> = {};
    jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).forEach((job) => {
      (grouped[job.scheduled_date] ??= []).push(job);
    });
    Object.values(grouped).forEach((dayJobs) => dayJobs.sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '')));
    return grouped;
  }, [jobs]);

  return (
    <div className="space-y-4" aria-label="Fourteen day schedule agenda">
      {days.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayJobs = jobsByDate[dateKey] ?? [];
        return (
          <section key={dateKey} className="min-w-0">
            <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-foreground">{isToday(day) ? 'Today' : format(day, 'EEEE')}</p>
                <p className="text-xs text-muted-foreground">{format(day, 'd MMMM')} · {dayJobs.length} clean{dayJobs.length === 1 ? '' : 's'}</p>
              </div>
              <button
                type="button"
                onClick={() => onAddJob(day)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                aria-label={`Schedule a clean on ${format(day, 'd MMMM')}`}
              >
                <CalendarPlus className="h-4 w-4" /> Add
              </button>
            </div>

            {dayJobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No cleans scheduled.</div>
            ) : (
              <div className="space-y-2">
                {dayJobs.map((job) => {
                  const status = statusMeta(job.status);
                  const StatusIcon = status.icon;
                  const cleanerNames = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean).map((id) => nameMap[id as string] || 'Cleaner');
                  const address = [job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ');
                  return (
                    <button
                      type="button"
                      key={job.id}
                      onClick={() => onJobClick(job)}
                      className="w-full min-w-0 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 active:scale-[0.99]"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="w-14 shrink-0 pt-0.5 text-sm font-extrabold text-foreground">{job.scheduled_time?.slice(0, 5) || 'TBC'}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-bold text-foreground">{jobLabel(job)}</p>
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${status.className}`}>
                              <StatusIcon className="h-3 w-3" /> {status.label}
                            </span>
                          </div>
                          {address && <p className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /> {address}</p>}
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" /> {cleanerNames.length ? cleanerNames.join(' + ') : 'Unassigned'}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
