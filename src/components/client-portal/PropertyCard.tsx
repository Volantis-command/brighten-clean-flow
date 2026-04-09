import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface PropertyCardProps {
  property: any;
  jobs: any[];
  cleanerProfiles: any[];
  latestAuditPct?: number | null;
  onClick?: () => void;
}

function getPropertyStatus(jobs: any[]) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const todayJob = jobs.find(
    (j: any) => j.scheduled_date === todayStr && ['scheduled', 'confirmed', 'in_progress'].includes(j.status)
  );
  if (todayJob) return { label: 'Clean Today', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };

  const lastComplete = jobs.find((j: any) => j.status === 'complete' || j.status === 'completed');
  if (lastComplete) {
    const completedDate = new Date(lastComplete.scheduled_date + 'T00:00:00');
    const daysDiff = Math.floor((today.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 2) return { label: 'Recently Cleaned', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };
  }

  const nextScheduled = jobs.find(
    (j: any) => ['scheduled', 'confirmed'].includes(j.status) && j.scheduled_date >= todayStr
  );
  if (nextScheduled) return { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };

  return { label: 'Awaiting Clean', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' };
}

export default function PropertyCard({ property, jobs, cleanerProfiles, latestAuditPct, onClick }: PropertyCardProps) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const statusInfo = getPropertyStatus(jobs);
  const lastCompleteJob = jobs.find((j: any) => j.status === 'complete' || j.status === 'completed');
  const nextScheduledJob = jobs.find(
    (j: any) => ['scheduled', 'confirmed', 'in_progress'].includes(j.status) && j.scheduled_date >= todayStr
  );

  const getCleanerName = (id: string) => {
    const c = cleanerProfiles.find((p: any) => p.id === id);
    return c?.full_name?.split(' ')[0] || null;
  };

  const nextCleanerName = nextScheduledJob?.cleaner_1_id ? getCleanerName(nextScheduledJob.cleaner_1_id) : null;

  return (
    <button
      onClick={onClick}
      className="bg-card rounded-2xl shadow-sm border border-border/50 p-5 text-left hover:shadow-md transition-shadow w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">{property.property_name}</h3>
          <p className="text-sm text-muted-foreground">
            {[property.address, property.suburb].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusInfo.color}`}>
          <div className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
          {statusInfo.label}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
        <span>{property.bedrooms || 0} bed / {property.bathrooms || 0} bath</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Next clean</span>
          <p className="font-semibold text-foreground">
            {nextScheduledJob
              ? format(new Date(nextScheduledJob.scheduled_date + 'T00:00:00'), 'EEE, d MMM') +
                (nextScheduledJob.scheduled_time ? ' at ' + nextScheduledJob.scheduled_time.slice(0, 5) : '')
              : '—'}
          </p>
          {nextCleanerName && (
            <p className="text-xs text-muted-foreground mt-0.5">Your cleaner: {nextCleanerName}</p>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">Last cleaned</span>
          <p className="font-semibold text-foreground">
            {lastCompleteJob
              ? format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')
              : '—'}
          </p>
        </div>
        {latestAuditPct != null && (
          <div>
            <span className="text-muted-foreground">QC Score</span>
            <p className={`font-bold ${latestAuditPct >= 80 ? 'text-primary' : latestAuditPct >= 60 ? 'text-orange-500' : 'text-destructive'}`}>
              {latestAuditPct}%
            </p>
          </div>
        )}
      </div>
    </button>
  );
}
