import { useState } from 'react';
import { Clock, MapPin, Users, Timer, ClipboardList, RotateCcw } from 'lucide-react';
import { InvoiceBadge } from '@/components/InvoiceBadge';
import { AcceptanceBadge } from '@/components/AcceptanceBadge';
import { ClockInOut } from '@/components/timeclock/ClockInOut';
import { useNavigate } from 'react-router-dom';
import { useTimeEntry } from '@/hooks/useTimeEntry';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getCurrentPosition } from '@/lib/geo';

interface ScheduleJobCardAcceptance {
  cleaner_id: string;
  cleaner_name: string;
  acceptance_status: string;
}

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
  invoiceStatus?: string | null;
  acceptances?: ScheduleJobCardAcceptance[];
  priceExGst?: number | null;
  isAdmin?: boolean;
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
  invoiceStatus,
  acceptances,
  priceExGst,
  isAdmin,
}: ScheduleJobCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusInfo = statusConfig[status] || statusConfig.scheduled;
  const cleanerNames = [cleaner1Name, cleaner2Name].filter(Boolean).join(' & ');
  const [returningToProperty, setReturningToProperty] = useState(false);

  const { data: timeEntry, refetch } = useTimeEntry(id, showClockIn ? user?.id : undefined);

  const isComplete = status === 'complete';

  const handleReturnToProperty = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setReturningToProperty(true);
    try {
      let lat: number | null = null, lng: number | null = null;
      try {
        const pos = await getCurrentPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch { /* no gps */ }

      const { error } = await supabase.from('time_entries').insert({
        job_id: id,
        user_id: user.id,
        clock_in_time: new Date().toISOString(),
        clock_in_lat: lat,
        clock_in_lng: lng,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Clocked in for return visit');
        queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
        queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
        queryClient.invalidateQueries({ queryKey: ['time-entry'] });
        refetch();
      }
    } catch {
      toast.error('Failed to start return visit');
    }
    setReturningToProperty(false);
  };

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
    <div
      className={`bg-card rounded-2xl shadow-md p-5 border border-border cursor-pointer transition-shadow hover:shadow-lg ${isPastJob ? 'opacity-60' : ''} ${getBorderClass()}`}
      onClick={() => navigate(`/jobs/${id}`)}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-lg font-bold text-foreground leading-tight">{propertyName}</h3>
          {isAdmin && priceExGst != null && priceExGst > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">${priceExGst.toFixed(2)} ex GST</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'complete' && <InvoiceBadge status={invoiceStatus} />}
          <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${statusInfo.className}`}>
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Users className="h-4 w-4 shrink-0" />
          <span>{cleanerNames}</span>
        </div>
      )}

      {acceptances && acceptances.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {acceptances.map((a) => (
            <div key={a.cleaner_id} className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{a.cleaner_name.split(' ')[0]}:</span>
              <AcceptanceBadge status={a.acceptance_status} compact />
            </div>
          ))}
        </div>
      )}

      {showClockIn && !isPastJob && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {isComplete ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${id}/checklist`); }}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary/10 text-primary font-bold text-sm hover:bg-primary/20 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                View Completed Job
              </button>
              <Button
                variant="outline"
                size="lg"
                className="w-full gap-2"
                onClick={handleReturnToProperty}
                disabled={returningToProperty}
              >
                <RotateCcw className="h-4 w-4" />
                {returningToProperty ? 'Starting…' : 'Return to Property'}
              </Button>
            </>
          ) : (
            <>
              <ClockInOut
                jobId={id}
                propertyName={propertyName}
                propertyLat={propertyLat ?? null}
                propertyLng={propertyLng ?? null}
                existingTimeEntry={timeEntry}
                onStatusChange={() => refetch()}
              />
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${id}/checklist`); }}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-secondary text-secondary-foreground font-bold text-sm hover:bg-secondary/80 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                Open Checklist
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
