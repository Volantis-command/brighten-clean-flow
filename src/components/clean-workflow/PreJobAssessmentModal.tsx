import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createAlert } from '@/lib/alerts';
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
  const [damagePhotos, setDamagePhotos] = useState<string[]>([]);
  const [damageNotes, setDamageNotes] = useState('');
  const [uploadingDamage, setUploadingDamage] = useState(false);
  const [savingDamage, setSavingDamage] = useState(false);
  const damageFileRef = useRef<HTMLInputElement>(null);

  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [extraNotes, setExtraNotes] = useState('');
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [savingExtra, setSavingExtra] = useState(false);
  const extraFileRef = useRef<HTMLInputElement>(null);

  const allocatedHrs = job.estimated_duration ? (job.estimated_duration / 60).toFixed(1) : '?';

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
    } catch { /* Non-blocking */ }
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
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const cleanerName = profile?.full_name || 'A cleaner';
    const address = property?.address || property?.property_name || 'Unknown';

    await supabase.from('jobs').update({
      damage_reported: true,
      damage_photos: damagePhotos,
      damage_notes: damageNotes || null,
      pre_clean_notes: [{ type: 'damage', note: damageNotes, photos: damagePhotos }] as any,
    }).eq('id', job.id);

    for (const url of damagePhotos) {
      const storagePath = url.split('/job-photos/')[1] ?? '';
      await supabase.from('job_photos').insert({
        job_id: job.id, storage_path: storagePath, public_url: url, room_label: 'Damage Report',
      });
    }

    // TRIPLE-CHANNEL ALERT: all three fire in parallel
    const adminNotifPromise = createAlert({
      event_type: 'damage_reported',
      title: '⚠️ Damage Reported',
      body: `${cleanerName} reported existing damage at ${address}: ${damageNotes || 'No details'}`,
      metadata: { job_id: job.id, cleaner_name: cleanerName, address, notes: damageNotes },
      link: `/jobs/${job.id}`,
    });

    const adminSmsPromise = sendAdminSms(
      `⚠️ DAMAGE REPORTED — ${cleanerName} found existing damage at ${address}. Details: ${damageNotes || 'See photos'}. View: https://app.brightly.cleaning/jobs/${job.id}`
    );

    // Client SMS via send-client-sms edge function
    const clientSmsPromise = (async () => {
      try {
        await supabase.functions.invoke('send-client-sms', {
          body: {
            job_id: job.id,
            message: `Hi, your cleaner ${cleanerName} has flagged an issue at ${address}: ${damageNotes || 'See details in portal'}. We'll follow up shortly. — Brightly`,
          },
        });
      } catch { /* non-blocking */ }
    })();

    await Promise.all([adminNotifPromise, adminSmsPromise, clientSmsPromise]);

    toast.success('Damage report submitted');
    setSavingDamage(false);
    setStep('extra_time');
  }

  async function handleNoExtraTime() {
    await supabase.from('jobs').update({ extra_time_requested: false }).eq('id', job.id);
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

    for (const url of extraPhotos) {
      const storagePath = url.split('/job-photos/')[1] ?? '';
      await supabase.from('job_photos').insert({
        job_id: job.id, storage_path: storagePath, public_url: url, room_label: 'Extra Time Evidence',
      });
    }

    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    if (admins) {
      await supabase.from('notifications').insert(admins.map((a: any) => ({
        user_id: a.user_id, title: '⏱ Extra Time Requested',
        message: `${cleanerName} at ${address} needs more than ${allocatedHrs} hrs`,
        type: 'extra_time', link: `/jobs/${job.id}`,
      })));
    }

    await sendAdminSms(`⏱ EXTRA TIME REQUEST — ${cleanerName} at ${address} needs more than ${allocatedHrs} hrs allocated. Reason: ${extraNotes || 'N/A'}. Approve at: https://app.brightly.cleaning/jobs/${job.id}`);
    toast.success('Extra time request sent');
    setSavingExtra(false);
    onComplete();
  }

  function PhotoGrid({ photos, setPhotos, uploading, fileRef, prefix, setUploadingFn }: any) {
    return (
      <>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f, prefix, setPhotos, setUploadingFn);
            e.target.value = '';
          }}
        />
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url: string, i: number) => (
            <div key={i} className="relative">
              <img src={url} alt="" className="w-full aspect-square object-cover rounded-xl" />
              <button onClick={() => setPhotos((prev: string[]) => prev.filter((_: any, idx: number) => idx !== i))} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors min-h-[80px]"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
            <span className="text-[10px] font-bold mt-1">Add Photo</span>
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-lg mx-auto safe-area-top safe-area-bottom">
      <div className="bg-primary text-primary-foreground px-5 py-5">
        <p className="text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider">
          Pre-Job Check — {step === 'damage' || step === 'damage_detail' ? '1 of 2' : '2 of 2'}
        </p>
        <h1 className="text-xl font-extrabold mt-1">
          {step === 'damage' || step === 'damage_detail' ? 'Is there any existing damage at this property?' : `Do you need more than the ${allocatedHrs} hrs allocated for this job?`}
        </h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      <div className="flex gap-2 px-5 py-3">
        <div className={`h-1.5 flex-1 rounded-full ${step === 'damage' || step === 'damage_detail' ? 'bg-primary' : 'bg-primary'}`} />
        <div className={`h-1.5 flex-1 rounded-full ${step === 'extra_time' || step === 'extra_time_detail' ? 'bg-primary' : 'bg-muted'}`} />
      </div>

      <main className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {step === 'damage' && (
          <div className="space-y-4">
            <Button onClick={handleNoDamage} className="w-full h-16 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white gap-2">
              <CheckCircle2 className="h-6 w-6" /> ✓ No Damage
            </Button>
            <Button onClick={() => setStep('damage_detail')} className="w-full h-16 text-lg font-extrabold rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2">
              <ShieldAlert className="h-6 w-6" /> ⚠ Damage Found
            </Button>
          </div>
        )}

        {step === 'damage_detail' && (
          <div className="space-y-4">
            <p className="font-bold text-foreground">Photograph all damage before starting</p>
            <PhotoGrid photos={damagePhotos} setPhotos={setDamagePhotos} uploading={uploadingDamage} fileRef={damageFileRef} prefix="damage" setUploadingFn={setUploadingDamage} />
            <Textarea placeholder="Describe the damage (optional)" value={damageNotes} onChange={e => setDamageNotes(e.target.value)} className="min-h-[80px] text-base rounded-xl" />
            <Button onClick={handleSubmitDamage} disabled={damagePhotos.length === 0 || savingDamage} className="w-full h-16 text-lg font-extrabold rounded-2xl">
              {savingDamage ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
              Submit & Continue
            </Button>
            <button onClick={() => setStep('damage')} className="text-sm text-muted-foreground underline w-full text-center">← Go back</button>
          </div>
        )}

        {step === 'extra_time' && (
          <div className="space-y-4">
            <Button onClick={handleNoExtraTime} className="w-full h-16 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white gap-2">
              <CheckCircle2 className="h-6 w-6" /> ✓ No, I'm Fine
            </Button>
            <Button onClick={() => setStep('extra_time_detail')} className="w-full h-16 text-lg font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-600 text-white gap-2">
              <Clock className="h-6 w-6" /> ⏱ Yes, Need More Time
            </Button>
          </div>
        )}

        {step === 'extra_time_detail' && (
          <div className="space-y-4">
            <p className="font-bold text-foreground">Provide photo evidence</p>
            <Textarea placeholder="Why do you need more time? (required)" value={extraNotes} onChange={e => setExtraNotes(e.target.value)} className="min-h-[80px] text-base rounded-xl" />
            <PhotoGrid photos={extraPhotos} setPhotos={setExtraPhotos} uploading={uploadingExtra} fileRef={extraFileRef} prefix="extra_time" setUploadingFn={setUploadingExtra} />
            <Button onClick={handleSubmitExtraTime} disabled={extraPhotos.length === 0 || !extraNotes.trim() || savingExtra} className="w-full h-16 text-lg font-extrabold rounded-2xl">
              {savingExtra ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : null}
              Submit Request
            </Button>
            <button onClick={() => setStep('extra_time')} className="text-sm text-muted-foreground underline w-full text-center">← Go back</button>
          </div>
        )}
      </main>
    </div>
  );
}
