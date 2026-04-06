import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { addDays, format, startOfWeek } from 'date-fns';
import { toast } from 'sonner';

type AvailabilityRow = {
  id?: string;
  date: string;
  available: boolean;
};

export default function CleanerAvailabilityPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [busyDate, setBusyDate] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const fromDate = format(days[0], 'yyyy-MM-dd');
  const toDate = format(days[days.length - 1], 'yyyy-MM-dd');

  const { data: availability = [], isLoading } = useQuery({
    queryKey: ['cleaner-availability', user?.id, fromDate, toDate],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaner_availability')
        .select('id, date, available')
        .eq('user_id', user!.id)
        .gte('date', fromDate)
        .lte('date', toDate);
      if (error) throw error;
      return (data ?? []) as AvailabilityRow[];
    },
  });

  const availMap = useMemo(() => {
    const m = new Map<string, AvailabilityRow>();
    availability.forEach((a) => m.set(a.date, a));
    return m;
  }, [availability]);

  const toggleDay = async (dateStr: string) => {
    if (!user) return;
    setBusyDate(dateStr);
    try {
      const existing = availMap.get(dateStr);
      const nextValue = existing ? !existing.available : false; // first toggle marks unavailable

      const { error } = await supabase
        .from('cleaner_availability')
        .upsert(
          {
            user_id: user.id,
            date: dateStr,
            available: nextValue,
          },
          { onConflict: 'user_id,date' }
        );
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['cleaner-availability'] });
      toast.success(nextValue ? 'Marked available' : 'Marked unavailable');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyDate(null);
    }
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" /> My Availability
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tap a day to mark yourself unavailable. Tap again to undo. Days default to available.
        </p>
      </div>

      <div className="bg-card rounded-2xl border-2 border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            className="h-9"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <p className="text-sm font-bold text-foreground">
            {format(days[0], 'd MMM')} – {format(days[days.length - 1], 'd MMM yyyy')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            className="h-9"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {days.map((d) => {
              const dateStr = format(d, 'yyyy-MM-dd');
              const row = availMap.get(dateStr);
              const isUnavailable = row && row.available === false;
              const isBusy = busyDate === dateStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => toggleDay(dateStr)}
                  disabled={isBusy}
                  className={`rounded-xl border-2 p-3 text-left transition-colors ${
                    isUnavailable
                      ? 'bg-destructive/10 border-destructive text-destructive'
                      : 'bg-emerald-50 border-emerald-500 text-emerald-900'
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                    {format(d, 'EEE')}
                  </p>
                  <p className="text-lg font-extrabold">{format(d, 'd MMM')}</p>
                  <p className="text-[11px] font-bold mt-1 flex items-center gap-1">
                    {isUnavailable ? (
                      <>
                        <X className="h-3 w-3" /> Unavailable
                      </>
                    ) : (
                      <>Available</>
                    )}
                  </p>
                  {isBusy && <Loader2 className="h-3 w-3 animate-spin mt-1" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-muted/30 border border-border p-4 text-xs text-muted-foreground">
        Your availability is visible to admin and the head cleaner so jobs aren't booked on
        days you're off. Need to take leave for more than a few days? Let Brendan know directly.
      </div>
    </div>
  );
}
