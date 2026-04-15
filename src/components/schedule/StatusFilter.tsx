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
    <div className="inline-flex bg-muted rounded-xl p-1 gap-0.5">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all',
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
