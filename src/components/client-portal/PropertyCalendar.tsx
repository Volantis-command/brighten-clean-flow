import { useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  format, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  cancelled: 'bg-muted-foreground',
};

export default function PropertyCalendar({ jobs, token, propertyId }: PropertyCalendarProps) {
  const [cursor, setCursor] = useState(new Date());

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

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const ds = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDate[ds] || [];
          const isCur = isSameMonth(day, cursor);
          const today = isToday(day);
          return (
            <div
              key={ds}
              className={`aspect-square rounded-lg border text-xs p-1 flex flex-col ${
                isCur ? 'bg-card border-border' : 'bg-muted/30 border-transparent text-muted-foreground'
              } ${today ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="font-bold leading-none">{format(day, 'd')}</div>
              {dayJobs.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-auto">
                  {dayJobs.slice(0, 4).map((j: any) => (
                    <div
                      key={j.id}
                      className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[j.status] || 'bg-muted-foreground'}`}
                      title={`${j.status} ${j.scheduled_time || ''}`}
                    />
                  ))}
                </div>
              )}
            </div>
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
    </div>
  );
}
