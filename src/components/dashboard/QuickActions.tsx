import { CalendarPlus, Calculator, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const actions = [
  { label: 'Schedule Job', icon: CalendarPlus, path: '/schedule', color: 'text-primary' },
  { label: 'Send Quote', icon: Calculator, path: '/quoting', color: 'text-primary' },
  { label: 'Add Property', icon: Building2, path: '/properties/new', color: 'text-primary' },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-3 gap-3">
      {actions.map(({ label, icon: Icon, path, color }) => (
        <button
          key={path}
          onClick={() => navigate(path)}
          className="bg-card rounded-2xl shadow-sm border border-border p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all min-h-[80px] active:scale-95"
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <span className="text-xs font-bold text-foreground text-center leading-tight">{label}</span>
        </button>
      ))}
    </div>
  );
}
