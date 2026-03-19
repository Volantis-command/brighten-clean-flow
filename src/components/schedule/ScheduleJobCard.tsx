import { Clock, MapPin, Users, Timer, ClipboardList } from 'lucide-react';
import { ClockInOut } from '@/components/timeclock/ClockInOut';
import { useNavigate } from 'react-router-dom';
import { useTimeEntry } from '@/hooks/useTimeEntry';
import { useAuth } from '@/contexts/AuthContext';

interface ScheduleJobCardProps {
  id: string;
  propertyName: string;
  address: string | null;
  scheduledTime: string | null;
  estimatedDuration: number | null;
  status: string;
  cleaner1Name?: string | null;
  cleaner2Name?: string | null;
  propertyLat?: number | null;
  propertyLng?: number | null;
  onClick?: () => void;
  showClockIn?: boolean;
  isPastJob?: boolean;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-accent text-accent-foreground' },
  complete: { label: 'Complete', className: 'bg-primary text-primary-foreground' },
  flagged: { label: 'Flagged', className: 'bg-destructive text-destructive-foreground' },
};

export function ScheduleJobCard({
  id,
  propertyName,
  address,
  scheduledTime,
  estimatedDuration,
  status,
  cleaner1Name,
  cleaner2Name,
  propertyLat,
  propertyLng,
  onClick,
  showClockIn,
  isPastJob,
}: ScheduleJobCardProps) {
  const { user } = useAuth();
  const statusInfo = statusConfig[status] || statusConfig.scheduled;
  const cleanerNames = [cleaner1Name, cleaner2Name].filter(Boolean).join(' & ');

  const { data: timeEntry, refetch } = useTimeEntry(id, showClockIn ? user?.id : undefined);

  return (
    <div className={`bg-card rounded-2xl shadow-md p-5 border border-border ${isPastJob ? 'opacity-60' : ''}`}>
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Users className="h-4 w-4 shrink-0" />
          <span>{cleanerNames}</span>
        </div>
      )}

      {showClockIn && !isPastJob && (
        <div className="mt-3 pt-3 border-t border-border">
          <ClockInOut
            jobId={id}
            propertyName={propertyName}
            propertyLat={propertyLat ?? null}
            propertyLng={propertyLng ?? null}
            existingTimeEntry={timeEntry}
            onStatusChange={() => refetch()}
          />
        </div>
      )}
    </div>
  );
}
