import { useMemo } from 'react';
import { buildCleanerLegend } from './cleanerColors';
import { cn } from '@/lib/utils';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';

interface CleanerCalendarLegendProps {
  jobs: ScheduleJob[];
  nameMap: Record<string, string>;
}

export function CalendarLegend({ jobs, nameMap }: CleanerCalendarLegendProps) {
  const legend = useMemo(() => buildCleanerLegend(jobs, nameMap), [jobs, nameMap]);

  if (legend.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-1 py-2">
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
      {/* Unassigned indicator */}
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full shrink-0 bg-muted-foreground/30" />
        <span className="text-[11px] font-semibold text-muted-foreground">Unassigned</span>
      </div>
    </div>
  );
}
