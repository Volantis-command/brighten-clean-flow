import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DollarSign, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, endOfWeek, format, startOfWeek } from 'date-fns';

type TimeEntry = {
  id: string;
  job_id: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_minutes: number | null;
  manual_hours: number | null;
};

export default function MyPaySummaryPage() {
  const { user, profile } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const fromIso = weekStart.toISOString();
  const toIso = addDays(weekEnd, 1).toISOString();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['my-pay-entries', user?.id, fromIso, toIso],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('id, job_id, clock_in_time, clock_out_time, total_minutes, manual_hours')
        .eq('user_id', user!.id)
        .gte('clock_in_time', fromIso)
        .lt('clock_in_time', toIso)
        .order('clock_in_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimeEntry[];
    },
  });

  const hourlyRate = (profile as any)?.hourly_rate
    ? Number((profile as any).hourly_rate)
    : 30;

  const summary = useMemo(() => {
    const totalMinutes = entries.reduce((acc, e) => {
      if (e.manual_hours) return acc + Number(e.manual_hours) * 60;
      return acc + (e.total_minutes || 0);
    }, 0);
    const totalHours = totalMinutes / 60;
    const gross = totalHours * hourlyRate;
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      gross: Math.round(gross * 100) / 100,
      shifts: entries.filter((e) => e.clock_out_time).length,
      open: entries.filter((e) => !e.clock_out_time).length,
    };
  }, [entries, hourlyRate]);

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" /> My Pay Summary
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estimated weekly earnings based on your clocked hours.
        </p>
      </div>

      <div className="bg-card rounded-2xl border-2 border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            className="text-muted-foreground hover:text-foreground p-2"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="text-sm font-bold text-foreground">
            {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM yyyy')}
          </p>
          <button
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            className="text-muted-foreground hover:text-foreground p-2"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="bg-primary text-primary-foreground rounded-2xl p-6 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/70">
              Estimated gross pay
            </p>
            <p className="text-5xl font-extrabold mt-2">${summary.gross.toFixed(2)}</p>
            <p className="text-xs text-primary-foreground/70 mt-3">
              {summary.totalHours.toFixed(2)} hrs × ${hourlyRate.toFixed(2)}/hr
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-2xl border-2 border-border p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Hours
              </p>
              <p className="text-2xl font-extrabold text-foreground mt-1">
                {summary.totalHours.toFixed(1)}
              </p>
            </div>
            <div className="bg-card rounded-2xl border-2 border-border p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Shifts
              </p>
              <p className="text-2xl font-extrabold text-foreground mt-1">{summary.shifts}</p>
            </div>
            <div className="bg-card rounded-2xl border-2 border-border p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Open
              </p>
              <p className="text-2xl font-extrabold text-foreground mt-1">{summary.open}</p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5" /> Shifts this week
            </h2>
            {entries.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">No clocked hours this week.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((e) => {
                  const minutes = e.manual_hours ? Number(e.manual_hours) * 60 : e.total_minutes || 0;
                  const hrs = minutes / 60;
                  const start = e.clock_in_time ? new Date(e.clock_in_time) : null;
                  const end = e.clock_out_time ? new Date(e.clock_out_time) : null;
                  return (
                    <div
                      key={e.id}
                      className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {start ? format(start, 'EEE d MMM') : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {start ? format(start, 'h:mma') : '—'} →{' '}
                          {end ? format(end, 'h:mma') : 'open'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-extrabold text-foreground">
                          {hrs > 0 ? `${hrs.toFixed(2)} hrs` : 'In progress'}
                        </p>
                        {hrs > 0 && (
                          <p className="text-xs text-muted-foreground">
                            ${(hrs * hourlyRate).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-muted/30 border border-border p-4 text-xs text-muted-foreground">
            This is an estimate. Final pay is calculated by admin from approved timesheets and may
            include super, allowances, and adjustments.
          </div>
        </>
      )}
    </div>
  );
}
