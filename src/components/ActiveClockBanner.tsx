import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTimeEntry } from '@/hooks/useActiveTimeEntry';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPosition } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';

function formatElapsedTime(startTime: string) {
  const elapsedMs = Date.now() - new Date(startTime).getTime();
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function ActiveClockBanner() {
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: activeEntry } = useActiveTimeEntry();
  const [elapsed, setElapsed] = useState('00:00:00');
  const [clockingOut, setClockingOut] = useState(false);

  // Hide the global clock-out banner on clean workflow routes
  // The only way to clock off should be via the completion form
  const isCleanRoute = location.pathname.startsWith('/clean/');
  if (isCleanRoute) return null;

  useEffect(() => {
    if (!activeEntry?.clock_in_time) return;
    const update = () => setElapsed(formatElapsedTime(activeEntry.clock_in_time));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeEntry?.clock_in_time]);

  if (!user || !activeEntry) return null;

  const handleClockOut = async () => {
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
      } catch {
        // no location fallback
      }

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
        toast.success('Clocked out!');
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
    <div className="fixed top-0 left-0 right-0 z-[9999] border-b border-border bg-accent text-accent-foreground shadow-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm font-extrabold md:text-base">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          <span className="truncate">{activeEntry.propertyName} · {elapsed}</span>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="h-9 shrink-0 gap-1.5 font-bold"
          onClick={handleClockOut}
          disabled={clockingOut}
        >
          {clockingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Clock Out
        </Button>
      </div>
    </div>
  );
}
