import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createAlert } from '@/lib/alerts';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentPosition, haversineDistance, formatDuration } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const GEO_FENCE_RADIUS = 200; // meters

type ClockStep = 'idle' | 'verifying' | 'verified' | 'outside_range' | 'clocked_in' | 'confirming_out';

interface ClockInOutProps {
  jobId: string;
  propertyName: string;
  propertyLat: number | null;
  propertyLng: number | null;
  existingTimeEntry?: {
    id: string;
    clock_in_time: string;
    clock_out_time: string | null;
  } | null;
  onStatusChange?: () => void;
}

export function ClockInOut({ jobId, propertyName, propertyLat, propertyLng, existingTimeEntry, onStatusChange }: ClockInOutProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ClockStep>('idle');
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState('');
  const [saving, setSaving] = useState(false);

  const isClockedIn = existingTimeEntry && existingTimeEntry.clock_in_time && !existingTimeEntry.clock_out_time;
  const stopCardClick = (e: React.MouseEvent) => e.stopPropagation();

  // Elapsed timer when clocked in
  useEffect(() => {
    if (!isClockedIn || !existingTimeEntry?.clock_in_time) return;
    const update = () => {
      const start = new Date(existingTimeEntry.clock_in_time).getTime();
      const mins = (Date.now() - start) / 60000;
      setElapsed(formatDuration(mins));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [isClockedIn, existingTimeEntry?.clock_in_time]);

  const handleClockInStart = async () => {
    setStep('verifying');
    try {
      const pos = await getCurrentPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setUserLat(lat);
      setUserLng(lng);

      if (propertyLat != null && propertyLng != null) {
        const dist = haversineDistance(lat, lng, propertyLat, propertyLng);
        setDistance(Math.round(dist));
        setStep(dist <= GEO_FENCE_RADIUS ? 'verified' : 'outside_range');
      } else {
        setDistance(null);
        setStep('verified');
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not get location. Please enable location services.');
      setStep('idle');
    }
  };

  const confirmClockIn = async (override: boolean) => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase.from('time_entries').insert({
      job_id: jobId,
      user_id: user.id,
      clock_in_time: new Date().toISOString(),
      clock_in_lat: userLat,
      clock_in_lng: userLng,
      geo_override: override,
      geo_distance_meters: distance,
    });

    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);

      // FIX 2: Geo-override admin alert
      if (override && distance) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        const cleanerName = profile?.full_name || 'A cleaner';
        const alertMsg = `${cleanerName} clocked on ${distance}m outside ${propertyName}`;

        await createAlert({
          event_type: 'geofence_override',
          title: '📍 Geofence Override',
          body: alertMsg,
          metadata: { lat: userLat, lng: userLng, distance_m: distance, job_id: jobId, cleaner_id: user.id },
          link: `/jobs/${jobId}`,
        });

        // SMS to admins
        try {
          await supabase.functions.invoke('send-admin-sms', {
            body: { message: `📍 GEOFENCE OVERRIDE — ${alertMsg}. Lat: ${userLat}, Lng: ${userLng}` },
          });
        } catch { /* non-blocking */ }
      }

      toast.success('Clocked in!');
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['time-entry'] });
      queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
      onStatusChange?.();
    }
    setSaving(false);
    setStep('idle');
  };

  const handleClockOutStart = () => {
    setStep('confirming_out');
  };

  const confirmClockOut = async () => {
    if (!existingTimeEntry || !user) return;
    setSaving(true);

    try {
      const pos = await getCurrentPosition();
      const clockOutTime = new Date();
      const clockInTime = new Date(existingTimeEntry.clock_in_time);
      const totalMinutes = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / 60000);

      const { error } = await supabase
        .from('time_entries')
        .update({
          clock_out_time: clockOutTime.toISOString(),
          clock_out_lat: pos.coords.latitude,
          clock_out_lng: pos.coords.longitude,
          total_minutes: totalMinutes,
        })
        .eq('id', existingTimeEntry.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Clocked out! Total: ${formatDuration(totalMinutes)}`);
        queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
        queryClient.invalidateQueries({ queryKey: ['time-entry'] });
        queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
        onStatusChange?.();
      }
    } catch {
      const clockOutTime = new Date();
      const clockInTime = new Date(existingTimeEntry.clock_in_time);
      const totalMinutes = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / 60000);

      await supabase
        .from('time_entries')
        .update({ clock_out_time: clockOutTime.toISOString(), total_minutes: totalMinutes })
        .eq('id', existingTimeEntry.id);

      toast.success(`Clocked out! Total: ${formatDuration(totalMinutes)}`);
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['time-entry'] });
      queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
      onStatusChange?.();
    }

    setSaving(false);
    setStep('idle');
  };

  if (existingTimeEntry?.clock_out_time) {
    const totalMins = existingTimeEntry
      ? Math.round((new Date(existingTimeEntry.clock_out_time).getTime() - new Date(existingTimeEntry.clock_in_time).getTime()) / 60000)
      : 0;
    return (
      <div className="bg-secondary rounded-2xl p-4 flex items-center gap-3" onClick={stopCardClick}>
        <CheckCircle className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="text-sm font-bold text-foreground">Job completed</p>
          <p className="text-xs text-muted-foreground">Total time: {formatDuration(totalMins)}</p>
        </div>
      </div>
    );
  }

  if (isClockedIn) {
    return (
      <div className="space-y-3" onClick={stopCardClick}>
        <div className="bg-primary/10 rounded-2xl p-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-primary animate-pulse shrink-0" />
          <div>
            <p className="text-sm font-bold text-foreground">Clocked in</p>
            <p className="text-lg font-extrabold text-primary">{elapsed || '0m'}</p>
          </div>
        </div>

        {step === 'confirming_out' ? (
          <div className="bg-card rounded-2xl shadow-md border border-border p-5 space-y-4">
            <p className="font-bold text-foreground">Clock out of {propertyName}?</p>
            <p className="text-sm text-muted-foreground">Total time: {elapsed}</p>
            <div className="flex gap-3">
              <Button variant="destructive" size="default" onClick={confirmClockOut} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirm Clock Out'}
              </Button>
              <Button variant="outline" size="default" onClick={() => setStep('idle')} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="destructive" size="lg" onClick={handleClockOutStart} className="w-full">
            Clock Out
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" onClick={stopCardClick}>
      {step === 'idle' && (
        <Button variant="default" size="lg" onClick={handleClockInStart} className="w-full gap-2">
          <MapPin className="h-5 w-5" />
          Clock In
        </Button>
      )}

      {step === 'verifying' && (
        <div className="bg-card rounded-2xl shadow-md border border-border p-5 flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="font-bold text-foreground">Verifying location…</p>
        </div>
      )}

      {step === 'verified' && (
        <div className="bg-card rounded-2xl shadow-md border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 text-primary">
            <CheckCircle className="h-6 w-6 shrink-0" />
            <div>
              <p className="font-bold">Location verified ✓</p>
              <p className="text-sm text-muted-foreground">You're at {propertyName}</p>
            </div>
          </div>
          <Button variant="default" size="lg" onClick={() => confirmClockIn(false)} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirm Clock In'}
          </Button>
        </div>
      )}

      {step === 'outside_range' && (
        <div className="bg-card rounded-2xl shadow-md border border-destructive/30 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-foreground">You appear to be {distance}m from the property</p>
              <p className="text-sm text-muted-foreground">You need to be within {GEO_FENCE_RADIUS}m of {propertyName} to clock in.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="default" onClick={() => confirmClockIn(true)} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Clock in anyway'}
            </Button>
            <Button variant="ghost" size="default" onClick={() => setStep('idle')} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
