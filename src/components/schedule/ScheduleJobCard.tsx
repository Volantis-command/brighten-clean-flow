import { Clock, MapPin, Users, Timer } from 'lucide-react';

interface ScheduleJobCardProps {
  propertyName: string;
  address: string | null;
  scheduledTime: string | null;
  estimatedDuration: number | null;
  status: string;
  cleaner1Name?: string | null;
  cleaner2Name?: string | null;
  onClick?: () => void;
  showStartButton?: boolean;
  isPastJob?: boolean;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-accent text-accent-foreground' },
  complete: { label: 'Complete', className: 'bg-primary text-primary-foreground' },
  flagged: { label: 'Flagged', className: 'bg-destructive text-destructive-foreground' },
};

export function ScheduleJobCard({
  propertyName,
  address,
  scheduledTime,
  estimatedDuration,
  status,
  cleaner1Name,
  cleaner2Name,
  onClick,
  showStartButton,
  isPastJob,
}: ScheduleJobCardProps) {
  const statusInfo = statusConfig[status] || statusConfig.scheduled;
  const cleanerNames = [cleaner1Name, cleaner2Name].filter(Boolean).join(' & ');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-card rounded-2xl shadow-md p-5 hover:shadow-lg transition-shadow border border-border ${isPastJob ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-lg font-bold text-foreground leading-tight">{propertyName}</h3>
        <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
      </div>

      {address && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{address}</span>
        </div>
      )}

      <div className="flex items-center gap-4 mb-2">
        {scheduledTime && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{scheduledTime}</span>
          </div>
        )}
        {estimatedDuration && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="h-4 w-4 shrink-0" />
            <span>{estimatedDuration}hr</span>
          </div>
        )}
      </div>

      {cleanerNames && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          <span>{cleanerNames}</span>
        </div>
      )}

      {showStartButton && status === 'scheduled' && !isPastJob && (
        <div className="mt-4">
          <span className="inline-flex items-center justify-center h-14 px-6 bg-primary text-primary-foreground font-bold rounded-2xl text-base">
            Start Job →
          </span>
        </div>
      )}
    </button>
  );
}
