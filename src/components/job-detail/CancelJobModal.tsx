import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onCancelled?: () => void;
}

const REASONS = [
  { value: 'client_request', label: 'Client Request' },
  { value: 'no_show', label: 'No Show' },
  { value: 'weather', label: 'Weather' },
  { value: 'other', label: 'Other' },
];

export function CancelJobModal({ open, onOpenChange, jobId, onCancelled }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [sendSms, setSendSms] = useState(false);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('jobs').update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancellation_notes: notes || null,
      } as any).eq('id', jobId);
      if (error) throw error;

      if (sendSms) {
        try {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-client-booking-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId, is_cancellation: true }),
          });
        } catch { /* best effort */ }
      }
    },
    onSuccess: () => {
      toast.success('Job cancelled');
      queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      onOpenChange(false);
      onCancelled?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Cancel Job</DialogTitle>
          <DialogDescription>Select a reason and optionally add notes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details..." />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="cancel-sms" checked={sendSms} onCheckedChange={v => setSendSms(!!v)} />
            <label htmlFor="cancel-sms" className="text-sm text-muted-foreground cursor-pointer">Send cancellation SMS to client</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button
            variant="destructive"
            onClick={() => cancelMutation.mutate()}
            disabled={!reason || cancelMutation.isPending}
            className="gap-2"
          >
            {cancelMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Cancel Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
