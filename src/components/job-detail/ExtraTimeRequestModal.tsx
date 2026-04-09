import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createAlert } from '@/lib/alerts';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeEntryId: string;
  jobId: string;
  propertyName: string;
  cleanerName: string;
}

export function ExtraTimeRequestModal({ open, onOpenChange, timeEntryId, jobId, propertyName, cleanerName }: Props) {
  const [minutes, setMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const mins = parseInt(minutes);
    if (!mins || mins <= 0) { toast.error('Enter valid minutes'); return; }
    if (!reason.trim()) { toast.error('Enter a reason'); return; }

    setSaving(true);
    try {
      await supabase.from('time_entries').update({
        extra_time_minutes: mins,
        extra_time_reason: reason,
        extra_time_status: 'pending',
      } as any).eq('id', timeEntryId);

      await supabase.from('jobs').update({
        extra_time_requested: true,
        extra_time_notes: reason,
      }).eq('id', jobId);

      await createAlert({
        event_type: 'extra_time_request',
        title: 'Extra Time Request',
        body: `${cleanerName} requests ${mins}min extra at ${propertyName}: ${reason}`,
        metadata: { job_id: jobId, time_entry_id: timeEntryId, minutes: mins, reason },
        link: `/jobs/${jobId}`,
      });

      try {
        await supabase.functions.invoke('send-admin-sms', {
          body: { message: `⏱️ EXTRA TIME — ${cleanerName} requests ${mins}min at ${propertyName}. Reason: ${reason}` },
        });
      } catch { /* non-blocking */ }

      toast.success('Extra time request submitted');
      onOpenChange(false);
      setMinutes('');
      setReason('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Request Extra Time</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Extra minutes needed</Label>
            <Input type="number" min="1" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="e.g. 30" />
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you need extra time?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
