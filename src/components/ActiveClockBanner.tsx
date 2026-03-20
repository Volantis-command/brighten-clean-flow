import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTimeEntry } from '@/hooks/useActiveTimeEntry';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPosition } from '@/lib/geo';
import { formatDuration } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { Loader2, Pause, Play, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export function ActiveClockBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: activeEntry } = useActiveTimeEntry();
  const [elapsed, setElapsed] = useState('');
  const [paused, setPaused] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);

  useEffect(() => {
    if (!activeEntry?.clock_in_time || paused) return;
    const update = () => {
      const start = new Date(activeEntry.clock_in_time).getTime();
      const mins = (Date.now() - start) / 60000;
      setElapsed(formatDuration(mins));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeEntry?.clock_in_time, paused]);

  if (!activeEntry) return null;

  const handleClockOut = async () => {
    if (!user || !activeEntry) return;
    setClockingOut(true);

    try {
      const clockOutTime = new Date();
      const clockInTime = new Date(activeEntry.clock_in_time);
      const totalMinutes = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / 60000);

      let outLat: number | undefined;
      let outLng: number | undefined;
      try {
        const pos = await getCurrentPosition();
        outLat = pos.coords.latitude;
        outLng = pos.coords.longitude;
      } catch { /* no location */ }

      const { error } = await supabase
        .from('time_entries')
        .update({
          clock_out_time: clockOutTime.toISOString(),
          clock_out_lat: outLat ?? null,
          clock_out_lng: outLng ?? null,
          total_minutes: totalMinutes,
        })
        .eq('id', activeEntry.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Clocked out! Total: ${formatDuration(totalMinutes)}`);
        queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
        queryClient.invalidateQueries({ queryKey: ['time-entry'] });
        queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      }
    } catch {
      toast.error('Failed to clock out');
    }

    setClockingOut(false);
  };

  return (
    <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm font-bold min-w-0">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shrink-0" />
        <span className="truncate">
          Clocked in — {activeEntry.propertyName} — {elapsed || '0m'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-3 text-xs font-bold gap-1.5"
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-3 text-xs font-bold gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={handleClockOut}
          disabled={clockingOut}
        >
          {clockingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          Clock Out
        </Button>
      </div>
    </div>
  );
}
