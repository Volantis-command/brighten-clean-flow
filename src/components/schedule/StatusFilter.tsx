import { Check, SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending_cleaner', label: 'Needs Cleaner' },
  { value: 'awaiting_cleaner_acceptance', label: 'Awaiting Cleaner' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
] as const;

interface StatusFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Six chips wrapped onto two rows and pushed the calendar off a phone screen.
 * They live behind one icon now, with a dot when a filter is actually on so
 * you can never be looking at a filtered calendar without knowing it.
 */
export function StatusFilter({ value, onChange }: StatusFilterProps) {
  const active = FILTERS.find((f) => f.value === value) || FILTERS[0];
  const filtering = value !== 'all';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'relative flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors sm:px-3',
            filtering
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
          aria-label={`Filter jobs, currently ${active.label}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className={filtering ? 'inline' : 'hidden sm:inline'}>{filtering ? active.label : 'Filter'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors',
              f.value === value ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
            )}
          >
            {f.label}
            {f.value === value && <Check className="h-4 w-4" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
