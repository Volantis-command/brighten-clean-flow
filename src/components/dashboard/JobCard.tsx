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

const statusConfig: Record<string, { label: string; style: React.CSSProperties }> = {
  scheduled: {
    label: 'Scheduled',
    style: { background: 'rgba(139,92,246,0.15)', color: '#C4B5FD' },
  },
  confirmed: {
    label: 'Confirmed',
    style: { background: 'rgba(139,92,246,0.15)', color: '#C4B5FD' },
  },
  in_progress: {
    label: 'In Progress',
    style: { background: 'rgba(254,219,0,0.15)', color: '#FEDB00' },
  },
  completed: {
    label: 'Completed',
    style: { background: 'rgba(34,197,94,0.20)', color: '#3A7560' },
  },
  complete: {
    label: 'Completed',
    style: { background: 'rgba(34,197,94,0.20)', color: '#3A7560' },
  },
  cancelled: {
    label: 'Cancelled',
    style: { background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', textDecoration: 'line-through' },
  },
  flagged: {
    label: 'Flagged',
    style: { background: 'rgba(239,68,68,0.20)', color: '#FCA5A5' },
  },
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

  // Determine left border color based on acceptance status (returns inline style)
  const getBorderStyle = (): React.CSSProperties => {
    if (!acceptances || acceptances.length === 0) return {};
    const hasDeclined = acceptances.some(a => a.acceptance_status === 'declined');
    const allAccepted = acceptances.every(a => a.acceptance_status === 'accepted');
    const hasPending = acceptances.some(a => a.acceptance_status === 'pending');
    if (hasDeclined) return { borderLeft: '3px solid #EF4444' };
    if (allAccepted) return { borderLeft: '3px solid #3A7560' };
    if (hasPending) return { borderLeft: '3px solid #FEDB00' };
    return {};
  };

  return (
    <button
      onClick={onClick}
      className="glass-card hover-lift w-full text-left p-5 fade-in"
      style={getBorderStyle()}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {isRecurring && <Repeat className="h-4 w-4 shrink-0" style={{ color: '#FEDB00' }} />}
          <h3 className="text-lg font-bold leading-tight" style={{ color: '#F0FDF4' }}>{propertyName}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {feedbackScore != null && feedbackScore > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-bold" style={{ color: '#FEDB00' }}>
              <Star className="h-3.5 w-3.5" style={{ fill: '#FEDB00' }} />
              {feedbackScore}
            </span>
          )}
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={statusInfo.style}
          >
            {statusInfo.label}
          </span>
        </div>
      </div>

      {address && (
        <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#86EFAC' }}>
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{address}</span>
        </div>
      )}

      {scheduledTime && (
        <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#86EFAC' }}>
          <Clock className="h-4 w-4 shrink-0" />
          <span className="tabular-nums">{scheduledTime}</span>
        </div>
      )}

      {cleanerNames && (
        <div className="flex items-center gap-2 text-sm" style={{ color: '#86EFAC' }}>
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
              className="inline-flex items-center justify-center h-14 px-5 font-extrabold rounded-xl text-base gap-2 transition-all active:scale-[0.98]"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#F0FDF4',
                border: '1px solid rgba(255, 255, 255, 0.10)',
              }}
            >
              <Navigation className="h-5 w-5" />
              Navigate
            </span>
          )}
          {showStartButton && status === 'scheduled' && (
            <span
              onClick={handleStartClick}
              className="inline-flex items-center justify-center h-14 px-6 font-bold rounded-xl text-base gap-2 flex-1 yellow-glow transition-all active:scale-[0.98]"
              style={{ background: '#FEDB00', color: '#0C463D' }}
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
