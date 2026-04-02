import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, X, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

export default function CompletionStep({ job, property, userId, onNext, onBack }: Props) {
  const [issuesAnswer, setIssuesAnswer] = useState<'yes' | 'no' | null>(null);
  const [issueNote, setIssueNote] = useState('');
  const [issuePhoto, setIssuePhoto] = useState<string | null>(null);
  const [uploadingIssue, setUploadingIssue] = useState(false);

  const [afterPhotos, setAfterPhotos] = useState<string[]>([]);
  const [uploadingAfter, setUploadingAfter] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const issueFileRef = useRef<HTMLInputElement>(null);
  const afterFileRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    issuesAnswer !== null &&
    (issuesAnswer === 'no' || issueNote.trim().length > 0) &&
    afterPhotos.length >= 1;

  async function uploadPhoto(file: File, label: string): Promise<string | null> {
    const path = `jobs/${job.id}/${label}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (error) { toast.error('Upload failed'); return null; }
    const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleIssuePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIssue(true);
    const url = await uploadPhoto(file, 'issue');
    if (url) setIssuePhoto(url);
    setUploadingIssue(false);
    e.target.value = '';
  }

  async function handleAfterPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAfter(true);
    const url = await uploadPhoto(file, 'after');
    if (url) setAfterPhotos(prev => [...prev, url]);

    // Also save to job_photos table
    if (url) {
      const path = url.split('/job-photos/')[1] ?? '';
      await supabase.from('job_photos').insert({
        job_id: job.id,
        storage_path: path,
        public_url: url,
        room_label: 'After',
      });
    }

    setUploadingAfter(false);
    e.target.value = '';
  }

  function formatAuPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+61')) return cleaned;
    if (cleaned.startsWith('61') && cleaned.length >= 11) return '+' + cleaned;
    if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);
    return '+61' + cleaned;
  }

  async function handleSubmit() {
    setSubmitting(true);
    const now = new Date();
    const clockOff = now.toISOString();

    // Calculate duration
    const clockOnTime = job.clock_on ? new Date(job.clock_on).getTime() : now.getTime();
    const durationMinutes = Math.round((now.getTime() - clockOnTime) / 60000);

    // Build completion notes
    let completionNotes = '';
    if (issuesAnswer === 'yes') {
      completionNotes = issueNote;
    }

    // Update job
    const { error } = await supabase.from('jobs').update({
      status: 'completed',
      clock_off: clockOff,
      check_out_time: clockOff,
      duration_minutes: durationMinutes,
      completion_notes: completionNotes || null,
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

    // Report issue if needed
    if (issuesAnswer === 'yes') {
      await supabase.from('property_issues').insert({
        job_id: job.id,
        property_id: property.id,
        reported_by: userId,
        description: issueNote,
        photo_url: issuePhoto,
        status: 'open',
      });
    }

    // Send completion SMS (fire and forget)
    sendCompletionSms().catch(err => console.error('SMS failed:', err));

    // Create admin notification
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    if (admins) {
      const notifs = admins.map((a: any) => ({
        user_id: a.user_id,
        title: 'Job Completed',
        message: `Clean at ${property?.property_name ?? 'property'} has been completed (${durationMinutes}min)`,
        type: 'job_completed',
        link: `/jobs/${job.id}`,
      }));
      await supabase.from('notifications').insert(notifs);
    }

    toast.success('Job completed!');
    setSubmitting(false);
    onNext('done');
  }

  async function sendCompletionSms() {
    const { data: cpRows } = await supabase.from('client_properties').select('client_id').eq('property_id', property?.id).limit(1);
    const clientId = cpRows?.[0]?.client_id;
    if (!clientId) return;

    const { data: clientProfile } = await supabase.from('profiles').select('full_name, phone').eq('id', clientId).maybeSingle();
    if (!clientProfile?.phone) return;

    const firstName = (clientProfile.full_name ?? '').split(' ')[0] || 'there';
    const addr = property?.address ?? 'your property';
    const message = `Hi ${firstName}, your clean at ${addr} is complete! We hope everything looks great. — Brightly Cleaning 🌿`;

    await supabase.functions.invoke('send-job-sms', {
      body: { to: formatAuPhone(clientProfile.phone), message },
    });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={() => onNext('in_progress')} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to Checklist
        </button>
        <h1 className="text-xl font-extrabold">Complete Job</h1>
        <p className="text-primary-foreground/70 text-sm">{property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-5 pb-32">
        {/* All tasks complete confirmation */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
            <p className="font-bold text-green-800">All cleaning tasks complete ✓</p>
          </CardContent>
        </Card>

        {/* Issues question */}
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="font-bold text-foreground">Any issues to report?</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant={issuesAnswer === 'yes' ? 'default' : 'outline'}
                className="flex-1 h-12 text-base font-bold rounded-xl"
                onClick={() => setIssuesAnswer('yes')}
              >Yes</Button>
              <Button
                variant={issuesAnswer === 'no' ? 'default' : 'outline'}
                className="flex-1 h-12 text-base font-bold rounded-xl"
                onClick={() => setIssuesAnswer('no')}
              >No</Button>
            </div>
            {issuesAnswer === 'yes' && (
              <div className="space-y-3 pt-2">
                <Textarea placeholder="Describe the issue..." value={issueNote} onChange={e => setIssueNote(e.target.value)} />
                <input ref={issueFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleIssuePhoto} />
                {issuePhoto ? (
                  <div className="relative inline-block">
                    <img src={issuePhoto} alt="Issue" className="w-24 h-24 object-cover rounded-xl" />
                    <button onClick={() => setIssuePhoto(null)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => issueFileRef.current?.click()} disabled={uploadingIssue}>
                    {uploadingIssue ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
                    Add Photo
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* After photos */}
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">After Photos</p>
              <span className="text-xs text-muted-foreground">Min. 1 required</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {afterPhotos.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt={`After ${i + 1}`} className="w-full aspect-square object-cover rounded-xl" />
                  <button
                    onClick={() => setAfterPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <input ref={afterFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAfterPhoto} />
              <button
                onClick={() => afterFileRef.current?.click()}
                disabled={uploadingAfter}
                className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              >
                {uploadingAfter ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                <span className="text-[10px] font-bold mt-1">Add Photo</span>
              </button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Fixed submit bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom z-50">
        <Button
          size="lg"
          className="w-full h-14 text-base font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white max-w-lg mx-auto block"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
          Submit & Complete
        </Button>
      </div>
    </div>
  );
}
