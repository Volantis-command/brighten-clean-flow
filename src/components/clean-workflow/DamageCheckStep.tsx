import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, ArrowLeft, AlertTriangle, CheckCircle2, X } from 'lucide-react';
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

export default function DamageCheckStep({ job, property, userId, onNext, onBack }: Props) {
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canProceed = answer === 'no' || (answer === 'yes' && note.trim().length > 0);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `jobs/${job.id}/damage_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
      setPhoto(data.publicUrl);
    } else {
      toast.error('Photo upload failed');
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleProceed() {
    setSaving(true);
    if (answer === 'yes') {
      const notes = [{ type: 'damage', note, photo_url: photo ?? undefined }];
      await supabase.from('jobs').update({ pre_clean_notes: notes as any }).eq('id', job.id);
    }
    setSaving(false);
    onNext('extra_time');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <ClockedOnBanner clockOn={job.clock_on} />
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> My Cleans
        </button>
        <h1 className="text-xl font-extrabold">Damage Check</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-5">
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="font-bold text-foreground text-lg">Any damage to the property?</p>
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
                <Textarea
                  placeholder="Describe the damage..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="min-h-[100px] text-base"
                />
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                {photo ? (
                  <div className="relative inline-block">
                    <img src={photo} alt="Damage" className="w-24 h-24 object-cover rounded-xl" />
                    <button onClick={() => setPhoto(null)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <Button variant="outline" className="h-12 rounded-xl" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                    Add Photo
                  </Button>
                )}
              </div>
            )}
            {answer === 'no' && (
              <p className="text-sm text-green-600 flex items-center gap-1 font-semibold"><CheckCircle2 className="h-4 w-4" /> No damage noted</p>
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
