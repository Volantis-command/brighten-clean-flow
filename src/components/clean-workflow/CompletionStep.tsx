import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';
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

export default function CompletionStep({ job, property, userId, onNext, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false);

  function formatAuPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+61')) return cleaned;
    if (cleaned.startsWith('61') && cleaned.length >= 11) return '+' + cleaned;
    if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);
    return '+61' + cleaned;
  }

  async function handleComplete() {
    setSubmitting(true);
    const now = new Date();
    const clockOff = now.toISOString();
    const clockOnTime = job.clock_on ? new Date(job.clock_on).getTime() : now.getTime();
    const durationMinutes = Math.round((now.getTime() - clockOnTime) / 60000);

    const { error } = await supabase.from('jobs').update({
      status: 'completed',
      clock_off: clockOff,
      check_out_time: clockOff,
      duration_minutes: durationMinutes,
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

    // Send completion SMS
    sendCompletionSms().catch(err => console.error('SMS failed:', err));

    // Admin notification
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
    const message = `Hi ${firstName}, your Brightly clean is complete! Thanks for using Brightly. 🧹`;

    await supabase.functions.invoke('send-job-sms', {
      body: { to: formatAuPhone(clientProfile.phone), message },
    });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <ClockedOnBanner clockOn={job.clock_on} />

      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <h1 className="text-xl font-extrabold">Complete Job</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-5 flex flex-col items-center justify-center">
        <Card className="border-green-200 bg-green-50 w-full">
          <CardContent className="p-5 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-bold text-green-800 text-lg">All tasks complete</p>
              <p className="text-sm text-green-700">Ready to clock off and finish the job</p>
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white"
          onClick={handleComplete}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <CheckCircle2 className="h-6 w-6 mr-2" />}
          Complete Job
        </Button>
      </main>
    </div>
  );
}
