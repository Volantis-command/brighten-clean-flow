import { cn } from '@/lib/utils';

export type CalendarView = 'agenda' | 'day' | 'week' | 'month';

interface CalendarViewToggleProps {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'agenda', label: 'Agenda' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function CalendarViewToggle({ view, onChange }: CalendarViewToggleProps) {
  return (
    <div className="grid w-full grid-cols-4 bg-muted rounded-xl p-1 gap-0.5 sm:inline-flex sm:w-auto" role="group" aria-label="Calendar view">
      {VIEWS.map(v => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            'min-h-11 px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all',
            view === v.value
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-background'
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
