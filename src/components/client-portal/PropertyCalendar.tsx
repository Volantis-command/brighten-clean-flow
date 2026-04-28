import { useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  format, isSameMonth, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Download, FileText, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface PropertyCalendarProps {
  jobs: any[];
  // For the iCal subscribe URL.
  token?: string;
  propertyId?: string;
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-primary',
  complete: 'bg-primary',
  in_progress: 'bg-amber-500',
  scheduled: 'bg-blue-500',
  confirmed: 'bg-blue-500',
  awaiting_cleaner: 'bg-blue-500',
  awaiting_cleaner_acceptance: 'bg-blue-500',
  cancelled: 'bg-muted-foreground',
};

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  complete: 'Completed',
  in_progress: 'In progress',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  awaiting_cleaner: 'Scheduled',
  awaiting_cleaner_acceptance: 'Scheduled',
  cancelled: 'Cancelled',
};

export default function PropertyCalendar({ jobs, token, propertyId }: PropertyCalendarProps) {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build the month grid: pad to start-of-week / end-of-week so the
  // calendar always renders 5–6 complete rows.
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1); }

  const jobsByDate: Record<string, any[]> = {};
  for (const j of jobs) {
    if (!j.scheduled_date) continue;
    if (!jobsByDate[j.scheduled_date]) jobsByDate[j.scheduled_date] = [];
    jobsByDate[j.scheduled_date].push(j);
  }

  const icsUrl = token && propertyId
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/property-calendar-ics?token=${token}&property_id=${propertyId}`
    : null;
  const subscribeUrl = icsUrl ? icsUrl.replace(/^https?:/, 'webcal:') : null;

  const copySubscribeLink = async () => {
    if (!subscribeUrl) return;
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      toast.success('Subscribe URL copied — paste into Apple/Google Calendar.');
    } catch {
      toast.error('Could not copy. Tap Download instead.');
    }
  };

  const selectedJobs = selectedDate ? (jobsByDate[selectedDate] || []) : [];
  const selectedDateLabel = selectedDate
    ? format(new Date(selectedDate + 'T00:00:00'), 'EEEE, d MMMM yyyy')
    : '';

  return (
    <div className="space-y-3">
      {/* Header: month nav + iCal actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-bold text-foreground min-w-[120px] text-center">
            {format(cursor, 'MMMM yyyy')}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {icsUrl && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={copySubscribeLink} className="gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Subscribe
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.open(icsUrl, '_blank')}
              title="Download .ics"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-center">{d}</div>
        ))}
      </div>

      {/* Grid — each cell is a button so the client can drill into a
          day's cleans. Empty days are still buttons (disabled) to keep
          the grid touch-target consistent. */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const ds = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDate[ds] || [];
          const isCur = isSameMonth(day, cursor);
          const today = isToday(day);
          const hasJobs = dayJobs.length > 0;
          return (
            <button
              key={ds}
              type="button"
              disabled={!hasJobs}
              onClick={() => hasJobs && setSelectedDate(ds)}
              className={`aspect-square rounded-lg border text-xs p-1 flex flex-col text-left transition-colors ${
                isCur ? 'bg-card border-border' : 'bg-muted/30 border-transparent text-muted-foreground'
              } ${today ? 'ring-2 ring-primary' : ''} ${
                hasJobs ? 'hover:border-primary hover:bg-primary/5 cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="font-bold leading-none">{format(day, 'd')}</div>
              {hasJobs && (
                <div className="flex flex-wrap gap-0.5 mt-auto">
                  {dayJobs.slice(0, 4).map((j: any) => (
                    <div
                      key={j.id}
                      className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[j.status] || 'bg-muted-foreground'}`}
                      title={`${STATUS_LABEL[j.status] || j.status} ${j.scheduled_time || ''}`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> Cleaned</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> In progress</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Scheduled</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" /> Cancelled</span>
      </div>

      {/* Day-detail modal — opens when client taps a day with jobs.
          Each job lists time, status, and (if completed and the job
          has a report_token) a link to the full clean report. */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => { if (!open) setSelectedDate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedDateLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selectedJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cleans on this day.</p>
            ) : (
              selectedJobs.map((j: any) => {
                const isCompleted = j.status === 'complete' || j.status === 'completed';
                const reportHref = isCompleted && j.report_token ? `/report/${j.report_token}` : null;
                return (
                  <div key={j.id} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[j.status] || 'bg-muted-foreground'}`} />
                        <span className="text-sm font-bold">
                          {STATUS_LABEL[j.status] || j.status}
                        </span>
                      </div>
                      {j.scheduled_time && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {j.scheduled_time.slice(0, 5)}
                        </span>
                      )}
                    </div>
                    {reportHref ? (
                      <Button asChild size="sm" variant="outline" className="w-full gap-2">
                        <a href={reportHref} target="_blank" rel="noopener noreferrer">
                          <FileText className="w-3.5 h-3.5" /> View clean report
                        </a>
                      </Button>
                    ) : isCompleted ? (
                      <p className="text-xs text-muted-foreground">Report not available for this clean.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Report will appear here once the clean is finished.</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
