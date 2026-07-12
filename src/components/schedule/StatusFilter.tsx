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

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className="flex w-full flex-wrap bg-muted rounded-xl p-1 gap-1 sm:w-auto" role="group" aria-label="Filter jobs by status">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            'min-h-10 flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-bold transition-all sm:flex-none',
            value === f.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
