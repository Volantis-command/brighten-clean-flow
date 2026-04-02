import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, User, Navigation, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { getCurrentPosition, haversineDistance } from '@/lib/geo';
import { toast } from 'sonner';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';

const GEOFENCE_RADIUS_METERS = 200;

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

export default function GeofenceStep({ job, property, userId, onNext, onBack }: Props) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobDate = new Date(job.scheduled_date + 'T' + (job.scheduled_time ?? '00:00'));

  async function handleStartJob() {
    setChecking(true);
    setError(null);

    try {
      const pos = await getCurrentPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Check geofence if property has coordinates
      if (property?.lat && property?.lng) {
        const distance = haversineDistance(lat, lng, Number(property.lat), Number(property.lng));
        if (distance > GEOFENCE_RADIUS_METERS) {
          setError(`You must be within ${GEOFENCE_RADIUS_METERS} metres of the property to start this job. You are currently ${Math.round(distance)}m away.`);
          setChecking(false);
          return;
        }
      }

      // Record arrival
      const now = new Date().toISOString();
      const { error: dbError } = await supabase
        .from('jobs')
        .update({
          arrived_at: now,
          arrived_lat: lat,
          arrived_lng: lng,
          status: 'in_progress',
        })
        .eq('id', job.id);

      if (dbError) {
        toast.error('Failed to update. Please try again.');
        setChecking(false);
        return;
      }

      toast.success('Location captured ✓');
      setChecking(false);
      onNext('clock_on');
    } catch (err: any) {
      setError('Could not get your location. Please enable location services and try again.');
      setChecking(false);
    }
  }

  function openMaps() {
    const addr = property?.address;
    if (!addr) return;
    const encoded = encodeURIComponent(addr);
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    window.open(isIos ? `maps://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> My Cleans
        </button>
        <h1 className="text-xl font-extrabold">Start Job</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">Head to the property & tap Start when you arrive</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-4">
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-lg font-bold text-foreground">{property?.property_name ?? 'Property'}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">{property?.address ?? 'No address'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">{format(jobDate, 'h:mm a')}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">{property?.client_name ?? '—'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {property?.address && (
          <Button variant="outline" className="w-full h-14 text-base font-bold rounded-2xl" onClick={openMaps}>
            <Navigation className="h-5 w-5 mr-2" /> Open in Maps
          </Button>
        )}

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white"
          onClick={handleStartJob}
          disabled={checking}
        >
          {checking ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
          Start Job
        </Button>
      </main>
    </div>
  );
}
