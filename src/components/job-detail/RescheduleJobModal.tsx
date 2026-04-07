import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  currentDate: string;
  currentTime: string | null;
  clientPhone?: string | null;
  clientName?: string | null;
  propertyName?: string | null;
  onRescheduled?: () => void;
}

export function RescheduleJobModal({
  open, onOpenChange, jobId, currentDate, currentTime,
  clientPhone, clientName, propertyName, onRescheduled,
}: Props) {
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState(currentDate);
  const [newTime, setNewTime] = useState(currentTime?.slice(0, 5) || '08:00');
  const [notifyClient, setNotifyClient] = useState(true);
  const [notifyCleaner, setNotifyCleaner] = useState(true);

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      // Update job date/time
      const { error } = await supabase.from('jobs').update({
        scheduled_date: newDate,
        scheduled_time: newTime,
      }).eq('id', jobId);
      if (error) throw error;

      // Cancel old pending SMS and re-schedule new reminders
      await supabase
        .from('scheduled_sms' as any)
        .update({ status: 'cancelled' } as any)
        .eq('job_id', jobId)
        .eq('status', 'pending');

      const formattedDate = format(new Date(newDate + 'T00:00:00'), 'EEEE, d MMMM');
      const firstName = (clientName || 'there').split(' ')[0];

      // Notify client
      if (notifyClient && clientPhone) {
        const msg = `Hi ${firstName}, your clean at ${propertyName || 'your property'} has been rescheduled to ${formattedDate} at ${newTime}. — Brightly 🌿`;
        try {
          await supabase.functions.invoke('send-job-sms', {
            body: { to: clientPhone, message: msg },
          });
        } catch { /* best effort */ }
      }

      // Notify cleaner
      if (notifyCleaner) {
        try {
          await supabase.functions.invoke('send-job-sms', {
            body: { job_id: jobId },
          });
        } catch { /* best effort */ }
      }
    },
    onSuccess: () => {
      const formattedDate = format(new Date(newDate + 'T00:00:00'), 'EEE, d MMM');
      toast.success(`Job rescheduled to ${formattedDate} at ${newTime}`);
      queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      onOpenChange(false);
      onRescheduled?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasChanged = newDate !== currentDate || newTime !== (currentTime?.slice(0, 5) || '08:00');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Reschedule Job
          </DialogTitle>
          <DialogDescription>Pick a new date and time. Optionally notify the client and cleaner.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>New Date *</Label>
            <Input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="h-12 rounded-xl"
            />
          </div>
          <div>
            <Label>New Time *</Label>
            <Input
              type="time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              className="h-12 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="notify-client"
                checked={notifyClient}
                onCheckedChange={v => setNotifyClient(!!v)}
                disabled={!clientPhone}
              />
              <label htmlFor="notify-client" className="text-sm text-muted-foreground cursor-pointer">
                Send reschedule SMS to client
                {!clientPhone && <span className="text-destructive ml-1">(no phone on file)</span>}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="notify-cleaner"
                checked={notifyCleaner}
                onCheckedChange={v => setNotifyCleaner(!!v)}
              />
              <label htmlFor="notify-cleaner" className="text-sm text-muted-foreground cursor-pointer">
                Notify assigned cleaner
              </label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => rescheduleMutation.mutate()}
            disabled={!hasChanged || !newDate || rescheduleMutation.isPending}
            className="gap-2"
          >
            {rescheduleMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
