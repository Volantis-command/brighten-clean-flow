// ============================================================================
// Who is off, across the top of every admin page.
//
// BJ, 14 Oct 2026: "i need the ability to show cleaners time off in the
// schedule page. maybe at the top of every page." Off today reads first and
// loudest; anything still booked on a cleaner while they are away is flagged,
// because that is the job that needs covering.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarOff, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchTimeOff, isOnDate, timeOffLabel } from '@/lib/timeOff';

export default function TimeOffBar() {
  const { role } = useAuth() as any;
  const navigate = useNavigate();
  const canSee = role === 'admin' || role === 'head_cleaner';

  const { data: leave = [] } = useQuery({
    queryKey: ['time-off-bar'],
    enabled: canSee,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchTimeOff(35),
  });

  if (!canSee || leave.length === 0) return null;

  const today = format(new Date(), 'yyyy-MM-dd');
  const offToday = leave.filter((l) => isOnDate(l, today));
  const upcoming = leave.filter((l) => !isOnDate(l, today)).slice(0, 6);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <CalendarOff className="h-3.5 w-3.5" /> Time off
      </span>

      {offToday.map((l) => (
        <button
          key={l.id}
          onClick={() => navigate('/availability')}
          className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400 hover:bg-amber-500/25"
        >
          {l.name.split(' ')[0]} off today
          {l.end_date !== today && <span className="font-medium opacity-80">· back {format(new Date(l.end_date + 'T00:00:00'), 'EEE d MMM')}</span>}
          {l.clashingJobs > 0 && <AlertTriangle className="h-3 w-3" />}
        </button>
      ))}

      {upcoming.map((l) => (
        <button
          key={l.id}
          onClick={() => navigate('/availability')}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
          title={l.clashingJobs > 0 ? `${l.clashingJobs} job${l.clashingJobs === 1 ? '' : 's'} still on ${l.name.split(' ')[0]} during this time off` : undefined}
        >
          <span className="font-bold text-foreground">{l.name.split(' ')[0]}</span>
          {timeOffLabel(l)}
          {l.clashingJobs > 0 && (
            <span className="flex items-center gap-1 font-bold text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {l.clashingJobs}
            </span>
          )}
        </button>
      ))}

      {offToday.length + upcoming.length < leave.length && (
        <button onClick={() => navigate('/availability')} className="text-xs font-bold text-primary hover:underline">
          +{leave.length - offToday.length - upcoming.length} more
        </button>
      )}
    </div>
  );
}
