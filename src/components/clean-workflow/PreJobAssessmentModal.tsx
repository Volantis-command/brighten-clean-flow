import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, X, ShieldAlert, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type ModalStep = 'damage' | 'damage_detail' | 'extra_time' | 'extra_time_detail';

interface Props {
  job: any;
  property: any;
  userId: string;
  onComplete: () => void;
}

export default function PreJobAssessmentModal({ job, property, userId, onComplete }: Props) {
  const [step, setStep] = useState<ModalStep>('damage');

  // Damage state
  const [damagePhotos, setDamagePhotos] = useState<string[]>([]);
  const [damageNotes, setDamageNotes] = useState('');
  const [uploadingDamage, setUploadingDamage] = useState(false);
  const [savingDamage, setSavingDamage] = useState(false);
  const damageFileRef = useRef<HTMLInputElement>(null);

  // Extra time state
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [extraNotes, setExtraNotes] = useState('');
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [savingExtra, setSavingExtra] = useState(false);
  const extraFileRef = useRef<HTMLInputElement>(null);

  async function uploadPhoto(
    file: File,
    prefix: string,
    setPhotos: React.Dispatch<React.SetStateAction<string[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
  ) {
    setUploading(true);
    const path = `jobs/${job.id}/${prefix}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
      setPhotos(prev => [...prev, data.publicUrl]);
    } else {
      toast.error('Photo upload failed');
    }
    setUploading(false);
  }

  async function sendAdminSms(message: string) {
    try {
      await supabase.functions.invoke('send-job-sms', {
        body: { to: 'ADMIN', message },
      });
    } catch {
      // Non-blocking — notification also sent in-app
    }
  }

  async function handleNoDamage() {
    await supabase.from('jobs').update({
      damage_reported: false,
      pre_clean_notes: [] as any,
    }).eq('id', job.id);
    setStep('extra_time');
  }

  async function handleSubmitDamage() {
    setSavingDamage(true);

    // Get cleaner name
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const cleanerName = profile?.full_name || 'A cleaner';
    const address = property?.address || property?.property_name || 'Unknown';

    await supabase.from('jobs').update({
      damage_reported: true,
      damage_photos: damagePhotos,
      damage_notes: damageNotes || null,
      pre_clean_notes: [{ type: 'damage', note: damageNotes, photos: damagePhotos }] as any,
    }).eq('id', job.id);

    // Save photos to job_photos table
    for (const url of damagePhotos) {
      const storagePath = url.split('/job-photos/')[1] ?? '';
      await supabase.from('job_photos').insert({
        job_id: job.id,
        storage_path: storagePath,
        public_url: url,
        room_label: 'Damage Report',
      });
    }

    // Admin notification
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    if (admins) {
      const notifs = admins.map((a: any) => ({
        user_id: a.user_id,
        title: '⚠️ Damage Reported',
        message: `${cleanerName} reported existing damage at ${address}`,
        type: 'damage_report',
        link: `/jobs/${job.id}`,
      }));
      await supabase.from('notifications').insert(notifs);
    }

    // SMS to admin
    const smsBody = `⚠️ DAMAGE REPORTED — ${cleanerName} has reported existing damage at ${address} before the clean started. Log in to review: https://app.brightly.cleaning/jobs/${job.id}`;
    await sendAdminSms(smsBody);

    toast.success('Damage report submitted');
    setSavingDamage(false);
    setStep('extra_time');
  }

  async function handleNoExtraTime() {
    await supabase.from('jobs').update({
      extra_time_requested: false,
    }).eq('id', job.id);
    onComplete();
  }

  async function handleSubmitExtraTime() {
    setSavingExtra(true);

    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const cleanerName = profile?.full_name || 'A cleaner';
    const address = property?.address || property?.property_name || 'Unknown';

    await supabase.from('jobs').update({
      extra_time_requested: true,
      extra_time_photos: extraPhotos,
      extra_time_notes: extraNotes || null,
    }).eq('id', job.id);

    // Save photos to job_photos table
    for (const url of extraPhotos) {
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
        title: '⏱ Extra Time Requested',
        message: `${cleanerName} at ${address} is requesting additional time`,
        type: 'extra_time',
        link: `/jobs/${job.id}`,
      }));
      await supabase.from('notifications').insert(notifs);
    }

    // SMS to admin
    const smsBody = `⏱ EXTRA TIME REQUEST — ${cleanerName} at ${address} is requesting additional time beyond the scheduled allocation. Photo evidence submitted. Review and approve at: https://app.brightly.cleaning/jobs/${job.id}`;
    await sendAdminSms(smsBody);

    toast.success('Extra time request sent');
    setSavingExtra(false);
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-lg mx-auto safe-area-top safe-area-bottom">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 py-5">
        <p className="text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider">Pre-Job Check</p>
        <h1 className="text-xl font-extrabold mt-1">
          {step === 'damage' || step === 'damage_detail' ? 'Step 1 — Damage Check' : 'Step 2 — Extra Time'}
        </h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      {/* Progress */}
      <div className="flex gap-2 px-5 py-3">
        <div className={`h-1.5 flex-1 rounded-full ${step === 'extra_time' || step === 'extra_time_detail' ? 'bg-primary' : 'bg-primary/40'}`} />
        <div className={`h-1.5 flex-1 rounded-full ${step === 'extra_time' || step === 'extra_time_detail' ? 'bg-primary/40' : 'bg-muted'}`} />
      </div>

      <main className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* STEP 1: Damage check */}
        {step === 'damage' && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-7 w-7 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-lg font-bold text-foreground">Is there any existing damage at this property?</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleNoDamage}
                className="h-20 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white flex flex-col gap-1"
              >
                <CheckCircle2 className="h-6 w-6" />
                No Damage
              </Button>
              <Button
                onClick={() => setStep('damage_detail')}
                className="h-20 text-lg font-extrabold rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground flex flex-col gap-1"
              >
                <ShieldAlert className="h-6 w-6" />
                Damage Found
              </Button>
            </div>
          </div>
        )}

        {/* STEP 1b: Damage detail */}
        {step === 'damage_detail' && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Camera className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
              <p className="text-lg font-bold text-foreground">Please photograph the damage</p>
            </div>

            <input ref={damageFileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(f, 'damage', setDamagePhotos, setUploadingDamage);
                e.target.value = '';
              }}
            />

            <div className="grid grid-cols-3 gap-2">
              {damagePhotos.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt={`Damage ${i + 1}`} className="w-full aspect-square object-cover rounded-xl" />
                  <button onClick={() => setDamagePhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => damageFileRef.current?.click()}
                disabled={uploadingDamage}
                className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              >
                {uploadingDamage ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                <span className="text-[10px] font-bold mt-1">Add Photo</span>
              </button>
            </div>

            <Textarea
              placeholder="Describe the damage (optional)"
              value={damageNotes}
              onChange={e => setDamageNotes(e.target.value)}
              className="min-h-[80px] text-base rounded-xl"
            />

            <Button
              size="lg"
              className="w-full h-16 text-lg font-extrabold rounded-2xl"
              onClick={handleSubmitDamage}
              disabled={damagePhotos.length === 0 || savingDamage}
            >
              {savingDamage ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
              Submit & Continue
            </Button>

            <button onClick={() => setStep('damage')} className="text-sm text-muted-foreground underline w-full text-center">
              ← Go back
            </button>
          </div>
        )}

        {/* STEP 2: Extra time check */}
        {step === 'extra_time' && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Clock className="h-7 w-7 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-lg font-bold text-foreground">Do you require more time than scheduled for this job?</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleNoExtraTime}
                className="h-20 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white flex flex-col gap-1"
              >
                <CheckCircle2 className="h-6 w-6" />
                No, I'm fine
              </Button>
              <Button
                onClick={() => setStep('extra_time_detail')}
                className="h-20 text-lg font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-600 text-white flex flex-col gap-1"
              >
                <Clock className="h-6 w-6" />
                Yes, need more time
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2b: Extra time detail */}
        {step === 'extra_time_detail' && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Camera className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-lg font-bold text-foreground">Please provide photo evidence</p>
            </div>

            <input ref={extraFileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(f, 'extra_time', setExtraPhotos, setUploadingExtra);
                e.target.value = '';
              }}
            />

            <div className="grid grid-cols-3 gap-2">
              {extraPhotos.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt={`Evidence ${i + 1}`} className="w-full aspect-square object-cover rounded-xl" />
                  <button onClick={() => setExtraPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => extraFileRef.current?.click()}
                disabled={uploadingExtra}
                className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              >
                {uploadingExtra ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                <span className="text-[10px] font-bold mt-1">Add Photo</span>
              </button>
            </div>

            <Textarea
              placeholder="Why do you need more time? (optional)"
              value={extraNotes}
              onChange={e => setExtraNotes(e.target.value)}
              className="min-h-[80px] text-base rounded-xl"
            />

            <Button
              size="lg"
              className="w-full h-16 text-lg font-extrabold rounded-2xl"
              onClick={handleSubmitExtraTime}
              disabled={extraPhotos.length === 0 || savingExtra}
            >
              {savingExtra ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
              Submit Request
            </Button>

            <button onClick={() => setStep('extra_time')} className="text-sm text-muted-foreground underline w-full text-center">
              ← Go back
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
