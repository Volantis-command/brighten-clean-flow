import { STATUS_COLORS } from './CalendarStatusColors';
import { cn } from '@/lib/utils';

export function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-1">
      {Object.entries(STATUS_COLORS).map(([key, val]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={cn('w-2.5 h-2.5 rounded-full', val.dot)} />
          <span className="text-[10px] font-bold text-muted-foreground">{val.label}</span>
        </div>
      ))}
    </div>
  );
}
