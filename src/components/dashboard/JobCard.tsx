import { useState } from 'react';
import { Clock, MapPin, Users, Loader2, Navigation, Repeat, Star } from 'lucide-react';
import { MapsActionSheet } from '@/components/MapsActionSheet';
import { AcceptanceBadge } from '@/components/AcceptanceBadge';

interface JobCardAcceptance {
  cleaner_id: string;
  cleaner_name: string;
  acceptance_status: string;
}

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
  acceptances?: JobCardAcceptance[];
  isRecurring?: boolean;
  feedbackScore?: number | null;
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
  acceptances,
  isRecurring,
  feedbackScore,
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

  // Determine left border color based on acceptance status
  const getBorderClass = () => {
    if (!acceptances || acceptances.length === 0) return '';
    const hasDeclined = acceptances.some(a => a.acceptance_status === 'declined');
    const allAccepted = acceptances.every(a => a.acceptance_status === 'accepted');
    const hasPending = acceptances.some(a => a.acceptance_status === 'pending');
    if (hasDeclined) return 'border-l-4 border-l-destructive';
    if (allAccepted) return 'border-l-4 border-l-primary';
    if (hasPending) return 'border-l-4 border-l-[hsl(45,100%,51%)]';
    return '';
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-card rounded-2xl shadow-md p-5 hover:shadow-lg transition-shadow border border-border ${getBorderClass()}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {isRecurring && <Repeat className="h-4 w-4 text-primary shrink-0" />}
          <h3 className="text-lg font-bold text-foreground leading-tight">{propertyName}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {feedbackScore != null && feedbackScore > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
              <Star className="h-3.5 w-3.5 fill-amber-500" />
              {feedbackScore}
            </span>
          )}
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>
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

      {acceptances && acceptances.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {acceptances.map((a) => (
            <div key={a.cleaner_id} className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{a.cleaner_name.split(' ')[0]}:</span>
              <AcceptanceBadge status={a.acceptance_status} compact />
            </div>
          ))}
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
