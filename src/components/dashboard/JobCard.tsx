import { useState } from 'react';
import { Clock, MapPin, Users, Loader2, Navigation } from 'lucide-react';
import { MapsActionSheet } from '@/components/MapsActionSheet';

interface JobCardProps {
  propertyName: string;
  address: string | null;
  scheduledTime: string | null;
  status: string;
  cleaner1Name?: string | null;
  cleaner2Name?: string | null;
  onClick?: () => void;
  showStartButton?: boolean;
  onStartJob?: () => Promise<void>;
  showNavigateButton?: boolean;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-accent text-accent-foreground' },
  complete: { label: 'Complete', className: 'bg-primary text-primary-foreground' },
  flagged: { label: 'Flagged', className: 'bg-destructive text-destructive-foreground' },
};

export function JobCard({
  propertyName,
  address,
  scheduledTime,
  status,
  cleaner1Name,
  cleaner2Name,
  onClick,
  showStartButton,
  onStartJob,
  showNavigateButton,
}: JobCardProps) {
  const statusInfo = statusConfig[status] || statusConfig.scheduled;
  const cleanerNames = [cleaner1Name, cleaner2Name].filter(Boolean).join(', ');
  const [starting, setStarting] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);

  const handleNavigateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMapsOpen(true);
  };

  const handleStartClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onStartJob || starting) return;
    setStarting(true);
    await onStartJob();
    setStarting(false);
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-2xl shadow-md p-5 hover:shadow-lg transition-shadow border border-border"
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

      {scheduledTime && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Clock className="h-4 w-4 shrink-0" />
          <span>{scheduledTime}</span>
        </div>
      )}

      {cleanerNames && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          <span>{cleanerNames}</span>
        </div>
      )}

      {(showStartButton || showNavigateButton) && (
        <div className="mt-4 flex gap-3">
          {showNavigateButton && address && (
            <span
              onClick={handleNavigateClick}
              className="inline-flex items-center justify-center h-14 px-5 bg-accent text-accent-foreground font-extrabold rounded-2xl text-base gap-2"
            >
              <Navigation className="h-5 w-5" />
              Navigate
            </span>
          )}
          {showStartButton && status === 'scheduled' && (
            <span
              onClick={handleStartClick}
              className="inline-flex items-center justify-center h-14 px-6 bg-primary text-primary-foreground font-bold rounded-2xl text-base gap-2 flex-1"
            >
              {starting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Clocking in…
                </>
              ) : (
                'Start Job →'
              )}
            </span>
          )}
        </div>
      )}

      <MapsActionSheet open={mapsOpen} onClose={() => setMapsOpen(false)} address={address || ''} />
    </button>
  );
}
