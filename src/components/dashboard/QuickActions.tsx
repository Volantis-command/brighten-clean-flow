import { UserPlus, CalendarPlus, MessageSquare, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QuickActionsProps {
  onScheduleClean?: () => void;
  onSendQuoteSMS?: () => void;
}

/**
 * Four primary quick-action buttons — the first thing an admin reaches for.
 * Schedule Clean and Send Quote SMS can trigger modals via props;
 * New Client and New Cleaner navigate to the respective pages.
 */
export function QuickActions({ onScheduleClean, onSendQuoteSMS }: QuickActionsProps) {
  const navigate = useNavigate();

  const actions = [
    {
      label: 'New Client',
      icon: UserPlus,
      onClick: () => navigate('/quote'),
      primary: true,
    },
    {
      label: 'Schedule Clean',
      icon: CalendarPlus,
      onClick: () => onScheduleClean ? onScheduleClean() : navigate('/schedule'),
      primary: false,
    },
    {
      label: 'Quote SMS',
      icon: MessageSquare,
      onClick: () => onSendQuoteSMS ? onSendQuoteSMS() : navigate('/quoting'),
      primary: false,
    },
    {
      label: 'New Cleaner',
      icon: Briefcase,
      onClick: () => navigate('/staff'),
      primary: false,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map(({ label, icon: Icon, onClick, primary }) => (
        <button
          key={label}
          onClick={onClick}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 text-center transition-all active:scale-95 hover:scale-[1.02] ${
            primary
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
              : 'bg-card border border-border hover:border-primary/40 hover:bg-primary/5 text-foreground'
          }`}
        >
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
            primary ? 'bg-white/20' : 'bg-primary/10'
          }`}>
            <Icon className={`h-4 w-4 ${primary ? 'text-primary-foreground' : 'text-primary'}`} style={primary ? {} : { color: '#FEDB00' }} />
          </div>
          <span className="text-[11px] font-bold leading-tight">{label}</span>
        </button>
      ))}
    </div>
  );
}
