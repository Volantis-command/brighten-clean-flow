import { cn } from '@/lib/utils';
import { getStatusColor, getAcceptanceIcon } from './CalendarStatusColors';
import { Repeat } from 'lucide-react';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CalendarJobCardProps {
  job: ScheduleJob;
  nameMap: Record<string, string>;
  acceptances?: { cleaner_id: string; cleaner_name: string; acceptance_status: string }[];
  compact?: boolean;
  onClick: () => void;
}

export function CalendarJobCard({ job, nameMap, acceptances, compact, onClick }: CalendarJobCardProps) {
  const sc = getStatusColor(job.status);
  const cleaners = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean).map(id => nameMap[id!] || 'Unknown');
  const propertyName = job.properties?.property_name || 'Unknown';

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold truncate border-l-3 transition-colors hover:opacity-80',
          sc.bg, sc.text, sc.border
        )}
        title={`${propertyName} — ${job.scheduled_time?.slice(0, 5) || ''} — ${cleaners.join(' & ')}`}
      >
        <div className="flex items-center gap-1.5">
          {job.series_id && <Repeat className="h-3 w-3 shrink-0" />}
          <span className="truncate">{propertyName}</span>
          {job.scheduled_time && (
            <span className="shrink-0 opacity-70">{job.scheduled_time.slice(0, 5)}</span>
          )}
          {cleaners[0] && (
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-extrabold">
              {cleaners[0].charAt(0)}
            </span>
          )}
          <span className={cn('w-2 h-2 rounded-full shrink-0', sc.dot)} />
        </div>
      </button>
    );
  }

  // Full card (day view / modal)
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border-l-4 bg-card shadow-sm hover:shadow-md transition-all p-3 group',
        sc.border
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {job.series_id && <Repeat className="h-3.5 w-3.5 text-primary shrink-0" />}
          <h4 className="text-sm font-bold text-foreground truncate">{propertyName}</h4>
        </div>
        <span className={cn('shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full', sc.bg, sc.text)}>
          {sc.label}
        </span>
      </div>

      {job.properties?.address && (
        <p className="text-[11px] text-muted-foreground truncate mb-1">{job.properties.address}{job.properties.suburb ? `, ${job.properties.suburb}` : ''}</p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-1">
        {job.scheduled_time && <span>🕐 {job.scheduled_time.slice(0, 5)}</span>}
        {job.estimated_duration && <span>⏱ {job.estimated_duration / 60}hr</span>}
        {job.price_ex_gst != null && job.price_ex_gst > 0 && (
          <span className="font-bold text-foreground">${job.price_ex_gst.toFixed(0)}</span>
        )}
      </div>

      {cleaners.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          {cleaners.map((name, i) => {
            const cId = i === 0 ? job.cleaner_1_id : job.cleaner_2_id;
            const acc = acceptances?.find(a => a.cleaner_id === cId);
            return (
              <div key={cId || i} className="flex items-center gap-1">
                <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-extrabold">
                  {name.charAt(0)}
                </span>
                <span className="text-[10px] text-muted-foreground">{name.split(' ')[0]}</span>
                {acc && <span className="text-[10px]">{getAcceptanceIcon(acc.acceptance_status)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </button>
  );
}
