// ============================================================================
// End of a residential or deep clean.
//
// No photo report. One question, "anything to report?", then the cleaner
// clocks off. By the time this shows, the job is already marked complete,
// invoiced and notes saved by the active clean view.
// ============================================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CircleCheck, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';
import { sendJobSms } from '@/lib/sendJobSms';

export default function ResidentialFinish({
  job, property, onDone,
}: {
  job: any;
  property: any;
  onDone: () => void | Promise<void>;
}) {
  const { profile } = useAuth();
  const [reporting, setReporting] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  // Runs the moment the clean finishes, not when the question is answered, so
  // it can't be lost if the cleaner closes the app first. job-completed-sms
  // creates the next clean in a recurring series; it used to run only from the
  // photo form, so skipping that form would have quietly stopped every
  // residential series. It sends no SMS.
  useEffect(() => {
    supabase.functions.invoke('job-completed-sms', { body: { job_id: job.id } }).catch(() => {});
  }, [job.id]);

  const finish = async (issue: string) => {
    setSaving(true);
    try {
      const note = issue.trim();
      const { error } = await supabase
        .from('jobs')
        .update({ completion_notes: note || null, completion_form_completed_at: new Date().toISOString() } as any)
        .eq('id', job.id);
      if (error) throw error;

      if (note) {
        const propName = property?.property_name || job?.client_name || 'a property';
        const who = profile?.full_name || 'The cleaner';
        // Both are best effort. The report is already saved on the job either way.
        try {
          await sendJobSms({ to: 'ADMIN', message: `Issue reported at ${propName}. ${who}: "${note.slice(0, 300)}"` });
        } catch { /* saved on the job regardless */ }
        try {
          const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
          if (admins?.length) {
            await supabase.from('notifications').insert(
              admins.map((a: any) => ({
                user_id: a.user_id,
                title: `Issue reported: ${propName}`,
                message: `${who}: ${note.slice(0, 500)}`,
                type: 'job_issue',
                link: `/jobs/${job.id}`,
                read: false,
              })) as any,
            );
          }
        } catch { /* saved on the job regardless */ }
        toast.success('Sent to the office');
      }
      await onDone();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save that. Try again.');
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center bg-background px-5 py-10">
      <div className="space-y-6">
        <div className="space-y-2">
          <CircleCheck className="h-9 w-9 text-primary" />
          <h1 className="text-2xl font-extrabold text-foreground">Clean complete</h1>
          <p className="text-sm text-muted-foreground">
            {property?.property_name || 'Nice work.'} One last question, then clock off.
          </p>
        </div>

        {!reporting ? (
          <div className="space-y-3">
            <p className="text-lg font-bold text-foreground">Anything to report?</p>
            <p className="text-sm text-muted-foreground">
              Damage, something broken or missing, or anything the office should know.
            </p>
            <button
              onClick={() => finish('')}
              disabled={saving}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'No, all good'}
            </button>
            <button
              onClick={() => setReporting(true)}
              disabled={saving}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-border text-base font-bold text-foreground disabled:opacity-60"
            >
              <AlertTriangle className="h-5 w-5 text-amber-400" /> Yes, report something
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-lg font-bold text-foreground">What happened?</p>
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Cracked tile in the main bathroom, client already knew"
              className="min-h-32 rounded-2xl text-base"
            />
            <button
              onClick={() => finish(text)}
              disabled={saving || !text.trim()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send and finish'}
            </button>
            <button
              onClick={() => setReporting(false)}
              disabled={saving}
              className="w-full text-sm font-bold text-muted-foreground underline"
            >
              Back
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">Next: clock off</p>
      </div>
    </div>
  );
}
