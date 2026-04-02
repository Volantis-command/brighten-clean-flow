import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
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

interface RoomSummary {
  room: string;
  total: number;
  completed: number;
  tasks: { task: string; completed: boolean }[];
}

export default function CompletionStep({ job, property, userId, onNext, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSummary(); }, []);

  async function loadSummary() {
    const [{ data: sopItems }, { data: completions }] = await Promise.all([
      supabase.from('property_sop_items').select('id, room, task, sort_order').eq('property_id', property.id).eq('active', true).order('room').order('sort_order'),
      supabase.from('job_checklist_completions').select('sop_item_id, completed').eq('job_id', job.id),
    ]);

    const cMap = new Map((completions ?? []).map((c: any) => [c.sop_item_id, c.completed]));
    const grouped: Record<string, { task: string; completed: boolean }[]> = {};
    (sopItems ?? []).forEach((s: any) => {
      if (!grouped[s.room]) grouped[s.room] = [];
      grouped[s.room].push({ task: s.task, completed: cMap.get(s.id) ?? false });
    });

    setRooms(Object.entries(grouped).map(([room, tasks]) => ({
      room,
      total: tasks.length,
      completed: tasks.filter(t => t.completed).length,
      tasks,
    })));
    setLoading(false);
  }

  function formatAuPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+61')) return cleaned;
    if (cleaned.startsWith('61') && cleaned.length >= 11) return '+' + cleaned;
    if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);
    return '+61' + cleaned;
  }

  async function handleClockOffSubmit() {
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

  const allComplete = rooms.length > 0 && rooms.every(r => r.completed === r.total);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <ClockedOnBanner clockOn={job.clock_on} />

      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <h1 className="text-xl font-extrabold">Final Sign-Off</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-3 pb-32">
        <p className="text-sm text-muted-foreground font-medium">Review each room before clocking off:</p>

        {rooms.map((room) => {
          const roomDone = room.completed === room.total;
          return (
            <Card key={room.room} className={`border ${roomDone ? 'border-green-200 bg-green-50/50' : 'border-destructive/30 bg-destructive/5'}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-foreground text-sm">{room.room}</h3>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${roomDone ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                    {room.completed}/{room.total}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {room.tasks.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {t.completed
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        : <Circle className="h-4 w-4 text-destructive shrink-0" />
                      }
                      <span className={t.completed ? 'text-muted-foreground' : 'text-foreground font-medium'}>
                        {t.task}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!allComplete && (
          <p className="text-sm text-destructive font-semibold text-center">
            ⚠️ Some tasks are incomplete. Go back to finish them or proceed anyway.
          </p>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom z-50">
        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl bg-destructive hover:bg-destructive/90 text-destructive-foreground max-w-lg mx-auto block"
          onClick={handleClockOffSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <CheckCircle2 className="h-6 w-6 mr-2" />}
          Clock Off & Submit
        </Button>
      </div>
    </div>
  );
}
