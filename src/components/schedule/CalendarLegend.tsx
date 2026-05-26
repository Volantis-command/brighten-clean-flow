import { useMemo } from 'react';
import { buildCleanerLegend } from './cleanerColors';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CleanerCalendarLegendProps {
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
}

const STATUS_LEGEND = [
  { color: 'bg-yellow-400', label: 'Needs Cleaner' },
  { color: 'bg-emerald-500', label: 'Scheduled' },
  { color: 'bg-blue-500', label: 'In Progress' },
  { color: 'bg-gray-400', label: 'Done — not invoiced' },
  { color: 'bg-purple-500', label: 'Done + invoiced' },
  { color: 'bg-red-500', label: 'Cancelled / Issue' },
];

export function CalendarLegend({ jobs, nameMap }: CleanerCalendarLegendProps) {
  const legend = useMemo(() => buildCleanerLegend(jobs, nameMap), [jobs, nameMap]);

  return (
    <div className="space-y-2 px-1 py-2">
      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Status</span>
        {STATUS_LEGEND.map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-full shrink-0 ${item.color}`} />
            <span className="text-[11px] font-semibold text-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Cleaner legend */}
      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Cleaners</span>
          {legend.map(item => (
            <div key={item.id} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: item.color.bg }}
              />
              <span className="text-[11px] font-semibold text-foreground">
                {item.name.split(' ')[0]}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full shrink-0 bg-muted-foreground/30" />
            <span className="text-[11px] font-semibold text-muted-foreground">Unassigned</span>
          </div>
        </div>
      )}
    </div>
  );
}
