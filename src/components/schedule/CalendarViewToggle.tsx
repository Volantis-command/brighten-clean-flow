import { cn } from '@/lib/utils';

export type CalendarView = 'day' | 'week' | 'month';

interface CalendarViewToggleProps {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function CalendarViewToggle({ view, onChange }: CalendarViewToggleProps) {
  return (
    <div className="inline-flex bg-muted rounded-xl p-1 gap-0.5">
      {VIEWS.map(v => (
        <button
          key={v.value}
          onClick={() => onChange(v.value)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-bold transition-all',
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
