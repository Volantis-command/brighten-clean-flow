import { cn } from '@/lib/utils';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: '✓ Confirmed' },
  { value: 'pending', label: '⏳ Pending' },
  { value: 'declined', label: '✗ Declined' },
] as const;

interface AcceptanceFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function AcceptanceFilter({ value, onChange }: AcceptanceFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors',
            value === f.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
