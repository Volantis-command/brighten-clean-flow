import { cn } from '@/lib/utils';

export type CalendarView = 'agenda' | 'day' | 'week' | 'month';

interface CalendarViewToggleProps {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}

// Short labels on a phone, because this sits in one toolbar row beside the
// month, the filter and the add button (BJ, 5 Nov 2026: "make everything above
// the calendar a lot more compact ... look at the apple calender").
const VIEWS: { value: CalendarView; label: string; short: string }[] = [
  { value: 'agenda', label: 'Agenda', short: 'List' },
  { value: 'day', label: 'Day', short: 'D' },
  { value: 'week', label: 'Week', short: 'W' },
  { value: 'month', label: 'Month', short: 'M' },
];

export function CalendarViewToggle({ view, onChange }: CalendarViewToggleProps) {
  return (
    <div className="inline-flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Calendar view">
      {VIEWS.map((v) => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          aria-label={v.label}
          aria-pressed={view === v.value}
          className={cn(
            'h-8 rounded-md px-2 text-xs font-bold transition-all sm:px-3',
            view === v.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="sm:hidden">{v.short}</span>
          <span className="hidden sm:inline">{v.label}</span>
        </button>
      ))}
    </div>
  );
}
