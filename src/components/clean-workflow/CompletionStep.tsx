import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, X, CheckCircle2, MapPin, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import ClockedOnBanner from './ClockedOnBanner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { triggerJobAutoInvoice } from '@/lib/jobInvoice';
import { MapsActionSheet } from '@/components/MapsActionSheet';
import { getAppBaseUrl } from '@/lib/appUrl';

const ROOM_CHECKLIST = [
  { id: 'kitchen', label: 'Kitchen cleaned' },
  { id: 'bathrooms', label: 'Bathrooms cleaned' },
  { id: 'floors', label: 'Floors vacuumed/mopped' },
  { id: 'beds', label: 'Beds made / linen changed' },
  { id: 'bins', label: 'Bins emptied' },
  { id: 'locked', label: 'Property locked and secured' },
];

interface Props {
  job: any;
  property: any;
  userId: string;
  onComplete: () => void;
}

export default function CompletionStep({ job, property, userId, onComplete }: Props) {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Query next job for today after completion
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: nextJob } = useQuery({
    queryKey: ['next-job-today', userId, todayStr, job.id],
    enabled: completed,
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_time, property_id, properties(property_name, address, suburb)')
        .eq('scheduled_date', todayStr)
        .eq('status', 'scheduled')
        .or(`cleaner_1_id.eq.${userId},cleaner_2_id.eq.${userId}`)
        .neq('id', job.id)
        .order('scheduled_time', { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `jobs/${job.id}/completion_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
      setPhotos(prev => [...prev, data.publicUrl]);
    } else {
      toast.error('Photo upload failed');
    }
    setUploading(false);
    e.target.value = '';
  }

  function toggleCheck(id: string) {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleConfirmClockOff() {
    setSubmitting(true);
    setShowConfirm(false);
    const now = new Date();
    const clockOff = now.toISOString();
    const clockOnTime = job.clock_on ? new Date(job.clock_on).getTime() : now.getTime();
    const totalPaused = (job.total_pause_seconds || 0) * 1000;
    const durationMinutes = Math.round((now.getTime() - clockOnTime - totalPaused) / 60000);

    const { error } = await supabase.from('jobs').update({
      status: 'completed',
      clock_off: clockOff,
      clock_off_at: clockOff,
      check_out_time: clockOff,
      duration_minutes: durationMinutes,
      completion_photos: photos,
      completion_notes: notes || null,
      completion_form_data: { checklist: Array.from(checkedItems) } as any,
      completion_form_completed_at: clockOff,
    }).eq('id', job.id);

    if (error) {
      toast.error('Failed to complete job');
      setSubmitting(false);
      return;
    }

    // Clock out time entry
    await supabase.from('time_entries')
      .update({ clock_out_time: clockOff, total_minutes: durationMinutes })
      .eq('job_id', job.id)
      .eq('user_id', userId)
      .is('clock_out_time', null);

    // Record clock_out event
    await supabase.from('clock_events').insert({
      user_id: userId,
      job_id: job.id,
      event_type: 'clock_out',
    } as any).then(() => {}, () => {});

    for (const url of photos) {
      const storagePath = url.split('/job-photos/')[1] ?? '';
      await supabase.from('job_photos').insert({
        job_id: job.id, storage_path: storagePath, public_url: url, room_label: 'Completion Photo',
      });
    }

    // Admin SMS
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const cleanerName = profile?.full_name || 'A cleaner';
    const address = property?.address || property?.property_name || 'Unknown';
    const timeFormatted = format(now, 'h:mm a');

    try {
      await supabase.functions.invoke('send-job-sms', {
        body: {
          to: 'ADMIN',
          message: `✅ JOB COMPLETE — ${cleanerName} has completed the clean at ${address}. Clock-off time: ${timeFormatted}. Post-clean photos submitted. View job: ${getAppBaseUrl()}/jobs/${job.id}`,
        },
      });
    } catch { /* non-blocking */ }

    // Admin notification
    await (await import('@/lib/alerts')).createAlert({
      event_type: 'cleaner_checked_in',
      title: 'Job Completed',
      body: `Clean at ${property?.property_name ?? 'property'} has been completed (${durationMinutes}min)`,
      link: `/jobs/${job.id}`,
    });

    // Auto-raise Xero invoice (fire-and-forget — non-blocking)
    triggerJobAutoInvoice(job.id).catch((err) => console.error('Auto invoice failed:', err));

    // Trigger guest-ready-sms for Airbnb turnovers
    const isAirbnb = property?.client_type === 'airbnb';
    if (isAirbnb) {
      supabase.functions.invoke('guest-ready-sms', { body: { job_id: job.id } }).catch((err) =>
        console.error('Guest-ready SMS failed:', err)
      );
    }

    toast.success('Job completed!');
    setSubmitting(false);
    setCompleted(true);
  }

  if (completed) {
    const nextProp = nextJob?.properties as any;
    const nextAddress = nextProp ? [nextProp.address, nextProp.suburb].filter(Boolean).join(', ') : null;
    const nextTime = nextJob?.scheduled_time?.slice(0, 5) || null;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-full flex items-center justify-center bg-primary/10 border-2 border-primary/30 w-24 h-24">
              <CheckCircle2 className="h-14 w-14 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground mb-2">
            {nextJob ? 'Job Complete!' : 'All Done for Today!'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {nextJob ? 'Great work! Your next job is ready.' : 'Great work. Your timesheet has been updated.'}
          </p>
        </div>

        {nextJob ? (
          <div className="w-full space-y-4">
            <Card className="border-border bg-card/50">
              <CardContent className="p-5 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Next Clean</p>
                <p className="font-bold text-lg text-foreground">{nextProp?.property_name || 'Property'}</p>
                {nextAddress && (
                  <p className="text-sm flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" /> {nextAddress}
                  </p>
                )}
                {nextTime && (
                  <p className="text-sm text-muted-foreground">Scheduled: {nextTime}</p>
                )}
              </CardContent>
            </Card>

            {nextAddress && (
              <Button
                size="lg"
                className="w-full h-14 rounded-2xl font-extrabold"
                onClick={() => setMapsOpen(true)}
              >
                <Navigation className="h-5 w-5 mr-2" /> Navigate
              </Button>
            )}

            <Button
              variant="outline"
              size="lg"
              className="w-full h-14 rounded-2xl font-extrabold"
              onClick={() => navigate(`/clean/${nextJob.id}`)}
            >
              View Job Details
            </Button>

            {nextAddress && (
              <MapsActionSheet
                open={mapsOpen}
                onClose={() => setMapsOpen(false)}
                address={nextAddress}
              />
            )}
          </div>
        ) : (
          <div className="w-full">
            <Button
              size="lg"
              className="w-full h-14 rounded-2xl font-extrabold"
              onClick={() => navigate('/dashboard')}
            >
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <ClockedOnBanner clockOn={job.clock_on} />

      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <h1 className="text-xl font-extrabold">Complete Your Clean</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.address || property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-5 pb-32">
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <h3 className="font-bold text-foreground">Post-clean photos</h3>
            <p className="text-sm text-muted-foreground">Upload at least 1 photo showing the completed clean</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt="" className="w-full aspect-square object-cover rounded-xl" />
                  <button onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                <span className="text-[10px] font-bold mt-1">Add Photo</span>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <h3 className="font-bold text-foreground">Room checklist</h3>
            <div className="space-y-2">
              {ROOM_CHECKLIST.map(item => (
                <label key={item.id} className="flex items-center gap-3 min-h-[48px] cursor-pointer" onClick={() => toggleCheck(item.id)}>
                  <Checkbox checked={checkedItems.has(item.id)} className="h-6 w-6" />
                  <span className={`text-sm ${checkedItems.has(item.id) ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>{item.label}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <h3 className="font-bold text-foreground">Any notes for the manager? (optional)</h3>
            <Textarea placeholder="e.g. ran low on supplies, owner left items behind..." value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[80px] text-base rounded-xl" />
          </CardContent>
        </Card>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom z-50">
        <Button size="lg" className="w-full h-16 text-lg font-extrabold rounded-2xl bg-brightly hover:bg-brightly-hover text-white max-w-lg mx-auto block"
          onClick={() => setShowConfirm(true)} disabled={photos.length === 0 || submitting}>
          {submitting ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <CheckCircle2 className="h-6 w-6 mr-2" />}
          Clock Off & Submit
        </Button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you ready to clock off?</AlertDialogTitle>
            <AlertDialogDescription>This will end your shift and submit your completion report.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClockOff}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
