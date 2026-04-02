import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, User, Navigation, Loader2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { getCurrentPosition } from '@/lib/geo';
import { toast } from 'sonner';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

export default function ArrivalStep({ job, property, userId, onNext, onBack }: Props) {
  const [arriving, setArriving] = useState(false);
  const jobDate = new Date(job.scheduled_date + 'T' + (job.scheduled_time ?? '00:00'));

  async function handleArrived() {
    setArriving(true);
    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const pos = await getCurrentPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // proceed without GPS
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({
        arrived_at: now,
        arrived_lat: lat,
        arrived_lng: lng,
        status: 'in_progress',
      })
      .eq('id', job.id);

    if (error) {
      toast.error('Failed to update. Please try again.');
      setArriving(false);
      return;
    }

    toast.success("Arrival recorded!");
    setArriving(false);
    onNext('pre_clean');
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
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> My Cleans
        </button>
        <h1 className="text-xl font-extrabold">On My Way</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">Head to the property & tap when you arrive</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-4">
        {/* Job info card */}
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

        {/* Navigate button */}
        {property?.address && (
          <Button variant="outline" className="w-full h-14 text-base font-bold rounded-2xl" onClick={openMaps}>
            <Navigation className="h-5 w-5 mr-2" /> Open in Maps
          </Button>
        )}

        {/* Arrived button */}
        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white"
          onClick={handleArrived}
          disabled={arriving}
        >
          {arriving ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
          I've Arrived
        </Button>
      </main>
    </div>
  );
}
