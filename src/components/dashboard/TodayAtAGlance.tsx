import { AlertTriangle, Clock, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface ClockedInCleaner {
  name: string;
  propertyName: string;
  clockInTime: string;
  userId: string;
}

interface Alert {
  id: string;
  message: string;
  type: string;
}

interface TodayAtAGlanceProps {
  kpi: {
    totalJobsToday: number;
    scheduledToday: number;
    inProgressToday: number;
    completedToday: number;
  };
  clockedInCleaners: ClockedInCleaner[];
  alerts: Alert[];
}

export function TodayAtAGlance({ kpi, clockedInCleaners, alerts }: TodayAtAGlanceProps) {
  return (
    <div>
      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Today at a Glance</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Jobs Today */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Jobs Today</h3>
          </div>
          <p className="text-3xl font-extrabold text-foreground mb-2">{kpi.totalJobsToday}</p>
          <div className="flex flex-wrap gap-2">
            {kpi.scheduledToday > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-muted text-muted-foreground px-2 py-1 rounded-full">
                <Clock className="h-3 w-3" /> {kpi.scheduledToday} Scheduled
              </span>
            )}
            {kpi.inProgressToday > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-accent/20 text-accent-foreground px-2 py-1 rounded-full">
                <Loader2 className="h-3 w-3" /> {kpi.inProgressToday} In Progress
              </span>
            )}
            {kpi.completedToday > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">
                <CheckCircle className="h-3 w-3" /> {kpi.completedToday} Completed
              </span>
            )}
          </div>
        </div>

        {/* Cleaners on the Clock */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">On The Clock</h3>
          </div>
          {clockedInCleaners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cleaners clocked in right now.</p>
          ) : (
            <div className="space-y-2">
              {clockedInCleaners.map((c) => (
                <div key={c.userId} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                  <span className="text-sm font-semibold text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    since {format(new Date(c.clockInTime), 'h:mm a')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-bold text-foreground">Alerts</h3>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">All clear! No alerts.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {alerts.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${a.type === 'danger' ? 'bg-destructive' : 'bg-[hsl(45,100%,51%)]'}`} />
                  <p className="text-xs text-foreground leading-tight">{a.message}</p>
                </div>
              ))}
              {alerts.length > 5 && (
                <p className="text-xs text-muted-foreground">+{alerts.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
