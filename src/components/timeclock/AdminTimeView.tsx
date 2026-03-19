import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, addWeeks } from 'date-fns';
import { formatDuration } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminTimeView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['admin-time-entries', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, profiles:user_id(full_name), jobs(scheduled_date, properties(property_name))')
        .gte('clock_in_time', weekStart.toISOString())
        .lte('clock_in_time', weekEnd.toISOString())
        .order('clock_in_time', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Group by user
  const byUser: Record<string, { name: string; entries: any[]; totalMinutes: number }> = {};
  entries.forEach((e: any) => {
    const uid = e.user_id;
    const name = (e as any).profiles?.full_name || 'Unknown';
    if (!byUser[uid]) byUser[uid] = { name, entries: [], totalMinutes: 0 };
    byUser[uid].entries.push(e);
    byUser[uid].totalMinutes += e.total_minutes || 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-primary">Time Tracking</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-bold text-foreground">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-primary font-bold text-center py-8">Loading time entries…</p>
      ) : Object.keys(byUser).length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center">
          <p className="text-muted-foreground">No time entries this week.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byUser).map(([uid, data]) => (
            <div key={uid} className="bg-card rounded-2xl shadow-md p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">{data.name}</h3>
                <span className="text-sm font-extrabold text-primary">
                  {formatDuration(data.totalMinutes)} total
                </span>
              </div>

              <div className="space-y-2">
                {data.entries.map((entry: any) => {
                  const propName = (entry as any).jobs?.properties?.property_name || 'Unknown';
                  const date = entry.clock_in_time ? format(new Date(entry.clock_in_time), 'EEE, MMM d') : '';
                  const timeIn = entry.clock_in_time ? format(new Date(entry.clock_in_time), 'h:mm a') : '—';
                  const timeOut = entry.clock_out_time ? format(new Date(entry.clock_out_time), 'h:mm a') : 'Active';
                  const dur = entry.total_minutes ? formatDuration(entry.total_minutes) : '—';

                  return (
                    <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{propName}</p>
                        <p className="text-xs text-muted-foreground">{date} · {timeIn} → {timeOut}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.geo_override && (
                          <span className="flex items-center gap-1 text-xs font-bold text-accent bg-accent/20 px-2 py-1 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            Override
                          </span>
                        )}
                        <span className="text-sm font-bold text-foreground">{dur}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
