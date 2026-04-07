import { CalendarPlus, MessageSquare, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-3 gap-3">
      <button
        onClick={() => navigate('/schedule')}
        className="bg-card rounded-2xl shadow-sm border border-border p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all min-h-[80px] active:scale-95"
      >
        <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(254,219,0,0.12)' }}>
          <CalendarPlus className="h-5 w-5" style={{ color: '#FEDB00' }} />
        </div>
        <span className="text-xs font-bold text-foreground text-center leading-tight">Schedule Job</span>
      </button>

      <button
        onClick={() => navigate('/onboard')}
        className="bg-card rounded-2xl shadow-sm border border-border p-4 flex flex-col items-center gap-2 transition-all min-h-[80px] active:scale-95 hover:shadow-[0_0_16px_rgba(254,219,0,0.15)]"
      >
        <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(254,219,0,0.12)' }}>
          <MessageSquare className="h-5 w-5" style={{ color: '#FEDB00' }} />
        </div>
        <span className="text-xs font-bold text-foreground text-center leading-tight">New Enquiry</span>
      </button>

      <button
        onClick={() => navigate('/onboard')}
        className="bg-card rounded-2xl shadow-sm border border-border p-4 flex flex-col items-center gap-2 transition-all min-h-[80px] active:scale-95 hover:shadow-[0_0_16px_rgba(254,219,0,0.15)]"
      >
        <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(254,219,0,0.12)' }}>
          <Building2 className="h-5 w-5" style={{ color: '#FEDB00' }} />
        </div>
        <span className="text-xs font-bold text-foreground text-center leading-tight">Add Property</span>
      </button>
    </div>
  );
}
