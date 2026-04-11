import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Clock, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentPosition, haversineDistance, formatDuration } from '@/lib/geo';

const GEOFENCE_M = 500;

type Job = {
  id: string;
  status: string;
  scheduled_time: string | null;
  property_id: string | null;
  properties?: {
    property_name: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
};

export function CleanerClockCard({ todayJobs }: { todayJobs: Job[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [pendingClockInJob, setPendingClockInJob] = useState<Job | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ jobId: string; distance: number } | null>(
    null
  );

  // Active clock event (last clock_in without clock_out)
  const { data: activeEvent } = useQuery({
    queryKey: ['active-clock-event', user?.id],
    enabled: !!user?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from('clock_events')
        .select('*')
        .eq('user_id', user!.id)
        .eq('event_type', 'clock_in')
        .order('event_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return null;

      // Look for a matching clock_out after this clock_in
      const { data: nextOut } = await supabase
        .from('clock_events')
        .select('id')
        .eq('user_id', user!.id)
        .eq('event_type', 'clock_out')
        .gte('event_at', data.event_at)
        .limit(1)
        .maybeSingle();

      return nextOut ? null : data;
    },
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!activeEvent) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(t);
  }, [activeEvent]);

  const elapsedMinutes = useMemo(() => {
    if (!activeEvent) return 0;
    const start = new Date(activeEvent.event_at).getTime();
    return Math.max(0, Math.round((Date.now() - start) / 60000));
  }, [activeEvent, tick]);

  const activeJob = useMemo(() => {
    if (!activeEvent?.job_id) return null;
    return todayJobs.find((j) => j.id === activeEvent.job_id) || null;
  }, [activeEvent, todayJobs]);

  // Pick the next job (first not-completed) to clock onto
  const nextJob = useMemo(() => {
    return (
      todayJobs.find((j) => j.status !== 'completed' && j.status !== 'cancelled') || todayJobs[0]
    );
  }, [todayJobs]);

  const performClockIn = async (job: Job, lat: number | null, lng: number | null, distance: number | null, geofenceWarning: boolean) => {
    if (!user) return;
    setBusy(true);
    try {
      // Insert clock event
      const { error } = await supabase.from('clock_events').insert({
        user_id: user.id,
        job_id: job.id,
        event_type: 'clock_in',
        lat,
        lng,
        distance_from_property_m: distance,
        geofence_warning: geofenceWarning,
      });
      if (error) throw error;

      // Mirror into time_entries (existing payroll source)
      await supabase.from('time_entries').insert({
        user_id: user.id,
        job_id: job.id,
        clock_in_time: new Date().toISOString(),
        clock_in_lat: lat,
        clock_in_lng: lng,
      });

      // Update job status
      await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', job.id);

      qc.invalidateQueries({ queryKey: ['active-clock-event'] });
      qc.invalidateQueries({ queryKey: ['active-time-entry'] });
      qc.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      qc.invalidateQueries({ queryKey: ['my-jobs'] });
      toast.success('Clocked on');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      setConfirmModal(null);
      setPendingClockInJob(null);
    }
  };

  const handleClockIn = async () => {
    const job = nextJob;
    if (!job) {
      toast.error('No job available to clock onto');
      return;
    }
    setPendingClockInJob(job);

    let lat: number | null = null;
    let lng: number | null = null;
    let distance: number | null = null;
    let geofenceWarning = false;

    try {
      const pos = await getCurrentPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      if (job.properties?.lat && job.properties?.lng) {
        distance = haversineDistance(lat, lng, job.properties.lat, job.properties.lng);
        if (distance > GEOFENCE_M) {
          geofenceWarning = true;
          setConfirmModal({ jobId: job.id, distance: Math.round(distance) });
          return;
        }
      }
    } catch {
      /* no GPS — proceed */
    }

    await performClockIn(job, lat, lng, distance, geofenceWarning);
  };

  const handleClockOut = async () => {
    if (!user || !activeEvent) return;
    setBusy(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await getCurrentPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        /* no GPS */
      }

      const startMs = new Date(activeEvent.event_at).getTime();
      const duration = Math.max(0, Math.round((Date.now() - startMs) / 60000));

      await supabase.from('clock_events').insert({
        user_id: user.id,
        job_id: activeEvent.job_id,
        event_type: 'clock_out',
        lat,
        lng,
        duration_minutes: duration,
      });

      // Mirror to time_entries
      const { data: openEntry } = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', user.id)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openEntry) {
        await supabase
          .from('time_entries')
          .update({
            clock_out_time: new Date().toISOString(),
            clock_out_lat: lat,
            clock_out_lng: lng,
            total_minutes: duration,
          })
          .eq('id', openEntry.id);
      }

      qc.invalidateQueries({ queryKey: ['active-clock-event'] });
      qc.invalidateQueries({ queryKey: ['active-time-entry'] });
      qc.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      toast.success(`Clocked off (${formatDuration(duration)})`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const propertyName = activeJob?.properties?.property_name;
  const startedTime = activeEvent
    ? new Date(activeEvent.event_at).toLocaleTimeString('en-AU', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      <div className="glass-card p-6 flex flex-col items-center gap-5">
        <div className="flex items-center gap-2 self-start">
          <Clock className="h-4 w-4" style={{ color: '#86EFAC' }} />
          <h3
            className="text-[11px] font-semibold uppercase"
            style={{ letterSpacing: '0.08em', color: '#86EFAC' }}
          >
            Time clock
          </h3>
        </div>

        {activeEvent ? (
          <>
            <button
              onClick={handleClockOut}
              disabled={busy}
              className="rounded-full flex flex-col items-center justify-center transition-all duration-300 hover:scale-105 active:scale-[0.98] disabled:opacity-60"
              style={{
                width: '140px',
                height: '140px',
                background: 'rgba(239,68,68,0.15)',
                border: '3px solid #EF4444',
                color: '#EF4444',
                boxShadow: '0 0 32px rgba(239,68,68,0.25)',
              }}
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <>
                  <span className="text-[11px] font-semibold tracking-widest opacity-80">CLOCK</span>
                  <span className="text-2xl font-extrabold tracking-wider">OFF</span>
                </>
              )}
            </button>
            <div className="text-center">
              <p
                className="text-3xl font-extrabold tabular-nums"
                style={{ color: '#F0FDF4', letterSpacing: '-0.02em' }}
              >
                {formatDuration(elapsedMinutes)}
              </p>
              <p className="text-xs mt-1" style={{ color: '#86EFAC' }}>
                Started {startedTime}
              </p>
              {propertyName && (
                <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: '#86EFAC' }}>
                  <MapPin className="h-3 w-3" /> {propertyName}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={handleClockIn}
              disabled={busy || !nextJob}
              className="rounded-full flex flex-col items-center justify-center pulse-glow transition-all duration-300 hover:scale-105 active:scale-[0.98] disabled:opacity-50 disabled:pulse-glow-none"
              style={{
                width: '140px',
                height: '140px',
                background: '#0C463D',
                border: '3px solid #2E5D4E',
                color: '#3A7560',
              }}
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <>
                  <span className="text-[11px] font-semibold tracking-widest opacity-80">CLOCK</span>
                  <span className="text-2xl font-extrabold tracking-wider">ON</span>
                </>
              )}
            </button>
            <div className="text-center">
              {nextJob ? (
                <p className="text-sm" style={{ color: '#86EFAC' }}>
                  Next job:{' '}
                  <span className="font-bold" style={{ color: '#F0FDF4' }}>
                    {nextJob.properties?.property_name}
                  </span>
                </p>
              ) : (
                <p className="text-sm" style={{ color: '#86EFAC' }}>No job available to clock onto.</p>
              )}
            </div>
          </>
        )}
      </div>

      <AlertDialog open={!!confirmModal} onOpenChange={(open) => !open && setConfirmModal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you at the property?</AlertDialogTitle>
            <AlertDialogDescription>
              You appear to be more than 500m from the property
              {confirmModal ? ` (~${confirmModal.distance}m away)` : ''}. Please confirm you are at
              the correct location.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingClockInJob || !confirmModal) return;
                try {
                  const pos = await getCurrentPosition();
                  await performClockIn(
                    pendingClockInJob,
                    pos.coords.latitude,
                    pos.coords.longitude,
                    confirmModal.distance,
                    true
                  );
                } catch {
                  await performClockIn(
                    pendingClockInJob,
                    null,
                    null,
                    confirmModal.distance,
                    true
                  );
                }
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
