import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, ArrowLeft, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

interface PreCleanNote {
  type: 'damage' | 'extra_work';
  note: string;
  photo_url?: string;
}

export default function PreCleanStep({ job, property, userId, onNext, onBack }: Props) {
  const [damageAnswer, setDamageAnswer] = useState<'yes' | 'no' | null>(null);
  const [damageNote, setDamageNote] = useState('');
  const [damagePhoto, setDamagePhoto] = useState<string | null>(null);
  const [uploadingDamage, setUploadingDamage] = useState(false);

  const [extraAnswer, setExtraAnswer] = useState<'yes' | 'no' | null>(null);
  const [extraNote, setExtraNote] = useState('');
  const [extraPhoto, setExtraPhoto] = useState<string | null>(null);
  const [uploadingExtra, setUploadingExtra] = useState(false);

  const [clockingOn, setClockingOn] = useState(false);
  const damageInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);

  const canProceed =
    damageAnswer !== null &&
    extraAnswer !== null &&
    (damageAnswer === 'no' || (damageNote.trim().length > 0)) &&
    (extraAnswer === 'no' || (extraNote.trim().length > 0));

  async function uploadPhoto(file: File, label: string): Promise<string | null> {
    const path = `jobs/${job.id}/pre_clean_${label}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (error) { toast.error('Photo upload failed'); return null; }
    const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleDamagePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDamage(true);
    const url = await uploadPhoto(file, 'damage');
    if (url) setDamagePhoto(url);
    setUploadingDamage(false);
    e.target.value = '';
  }

  async function handleExtraPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingExtra(true);
    const url = await uploadPhoto(file, 'extra');
    if (url) setExtraPhoto(url);
    setUploadingExtra(false);
    e.target.value = '';
  }

  async function handleClockOn() {
    setClockingOn(true);
    const now = new Date().toISOString();

    // Build pre-clean notes
    const notes: PreCleanNote[] = [];
    if (damageAnswer === 'yes') {
      notes.push({ type: 'damage', note: damageNote, photo_url: damagePhoto ?? undefined });
    }
    if (extraAnswer === 'yes') {
      notes.push({ type: 'extra_work', note: extraNote, photo_url: extraPhoto ?? undefined });
    }

    const { error } = await supabase
      .from('jobs')
      .update({
        clock_on: now,
        pre_clean_notes: notes,
      })
      .eq('id', job.id);

    if (error) {
      toast.error('Failed to clock on');
      setClockingOn(false);
      return;
    }

    // Also create time_entry for the banner
    await supabase.from('time_entries').insert({
      job_id: job.id,
      user_id: userId,
      clock_in_time: now,
      geo_override: false,
    }).then(() => {});

    toast.success('Clocked on! Timer started.');
    setClockingOn(false);
    onNext('in_progress');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> My Cleans
        </button>
        <h1 className="text-xl font-extrabold">Pre-Clean Check</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-5">
        {/* Damage question */}
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="font-bold text-foreground">Any visible damage at the property?</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant={damageAnswer === 'yes' ? 'default' : 'outline'}
                className="flex-1 h-12 text-base font-bold rounded-xl"
                onClick={() => setDamageAnswer('yes')}
              >Yes</Button>
              <Button
                variant={damageAnswer === 'no' ? 'default' : 'outline'}
                className="flex-1 h-12 text-base font-bold rounded-xl"
                onClick={() => setDamageAnswer('no')}
              >No</Button>
            </div>
            {damageAnswer === 'yes' && (
              <div className="space-y-3 pt-2">
                <Textarea
                  placeholder="Describe the damage..."
                  value={damageNote}
                  onChange={e => setDamageNote(e.target.value)}
                  className="min-h-[80px]"
                />
                <input ref={damageInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleDamagePhoto} />
                {damagePhoto ? (
                  <div className="relative inline-block">
                    <img src={damagePhoto} alt="Damage" className="w-24 h-24 object-cover rounded-xl" />
                    <button onClick={() => setDamagePhoto(null)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => damageInputRef.current?.click()} disabled={uploadingDamage}>
                    {uploadingDamage ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
                    Add Photo
                  </Button>
                )}
              </div>
            )}
            {damageAnswer === 'no' && (
              <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> No damage noted</p>
            )}
          </CardContent>
        </Card>

        {/* Extra work question */}
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="font-bold text-foreground">Any extra cleaning required beyond standard scope?</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant={extraAnswer === 'yes' ? 'default' : 'outline'}
                className="flex-1 h-12 text-base font-bold rounded-xl"
                onClick={() => setExtraAnswer('yes')}
              >Yes</Button>
              <Button
                variant={extraAnswer === 'no' ? 'default' : 'outline'}
                className="flex-1 h-12 text-base font-bold rounded-xl"
                onClick={() => setExtraAnswer('no')}
              >No</Button>
            </div>
            {extraAnswer === 'yes' && (
              <div className="space-y-3 pt-2">
                <Textarea
                  placeholder="Describe extra work needed..."
                  value={extraNote}
                  onChange={e => setExtraNote(e.target.value)}
                  className="min-h-[80px]"
                />
                <input ref={extraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleExtraPhoto} />
                {extraPhoto ? (
                  <div className="relative inline-block">
                    <img src={extraPhoto} alt="Extra" className="w-24 h-24 object-cover rounded-xl" />
                    <button onClick={() => setExtraPhoto(null)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => extraInputRef.current?.click()} disabled={uploadingExtra}>
                    {uploadingExtra ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
                    Add Photo (optional)
                  </Button>
                )}
              </div>
            )}
            {extraAnswer === 'no' && (
              <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Standard scope confirmed</p>
            )}
          </CardContent>
        </Card>

        {/* Clock On */}
        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white"
          onClick={handleClockOn}
          disabled={!canProceed || clockingOn}
        >
          {clockingOn ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <Clock className="h-6 w-6 mr-2" />}
          Clock On
        </Button>
      </main>
    </div>
  );
}

function Clock(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  );
}
