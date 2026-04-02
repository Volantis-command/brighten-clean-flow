import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Loader2, ArrowLeft, Clock, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';
import ClockedOnBanner from './ClockedOnBanner';

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

export default function ExtraTimeStep({ job, property, userId, onNext, onBack }: Props) {
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canProceed = answer === 'no' || (answer === 'yes' && photos.length >= 1);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `jobs/${job.id}/extra_time_${Date.now()}.jpg`;
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

  async function handleProceed() {
    setSaving(true);

    if (answer === 'yes') {
      await supabase.from('jobs').update({
        extra_time_requested: true,
      }).eq('id', job.id);

      // Save photos to job_photos
      for (const url of photos) {
        const storagePath = url.split('/job-photos/')[1] ?? '';
        await supabase.from('job_photos').insert({
          job_id: job.id,
          storage_path: storagePath,
          public_url: url,
          room_label: 'Extra Time Evidence',
        });
      }

      // Admin notification
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins) {
        const notifs = admins.map((a: any) => ({
          user_id: a.user_id,
          title: 'Extra Time Requested',
          message: `Extra time requested at ${property?.property_name ?? 'property'}`,
          type: 'extra_time',
          link: `/jobs/${job.id}`,
        }));
        await supabase.from('notifications').insert(notifs);
      }

      toast.success('Extra time request sent to admin for approval.');
    }

    setSaving(false);
    onNext('in_progress');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <ClockedOnBanner clockOn={job.clock_on} />
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> My Cleans
        </button>
        <h1 className="text-xl font-extrabold">Extra Time</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-5">
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-2">
              <Clock className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="font-bold text-foreground text-lg">Do you need extra time at this location?</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant={answer === 'yes' ? 'default' : 'outline'}
                className="flex-1 h-14 text-lg font-bold rounded-xl"
                onClick={() => setAnswer('yes')}
              >Yes</Button>
              <Button
                variant={answer === 'no' ? 'default' : 'outline'}
                className="flex-1 h-14 text-lg font-bold rounded-xl"
                onClick={() => setAnswer('no')}
              >No</Button>
            </div>
            {answer === 'yes' && (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground font-medium">Upload at least 1 photo showing why extra time is needed</p>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((url, i) => (
                    <div key={i} className="relative">
                      <img src={url} alt={`Evidence ${i + 1}`} className="w-full aspect-square object-cover rounded-xl" />
                      <button
                        onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                    <span className="text-[10px] font-bold mt-1">Add Photo</span>
                  </button>
                </div>
              </div>
            )}
            {answer === 'no' && (
              <p className="text-sm text-green-600 flex items-center gap-1 font-semibold"><CheckCircle2 className="h-4 w-4" /> Standard time confirmed</p>
            )}
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl"
          onClick={handleProceed}
          disabled={!canProceed || saving}
        >
          {saving ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
          Continue
        </Button>
      </main>
    </div>
  );
}
