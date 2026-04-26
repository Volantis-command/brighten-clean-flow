import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Repeat, PauseCircle, XCircle, FastForward, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface RecurringScheduleControlsProps {
  token: string;
  propertyId: string;
}

type Action = 'pause' | 'cancel' | 'skip_next';

const ACTION_META: Record<Action, { label: string; description: string; toast: string }> = {
  pause: {
    label: 'Pause schedule',
    description: 'We\'ll pause your recurring cleans and reach out to confirm when you\'d like them to resume.',
    toast: "We'll pause your schedule and be in touch.",
  },
  cancel: {
    label: 'Cancel recurring',
    description: 'We\'ll stop your recurring cleans and reach out to confirm a final date and any handover.',
    toast: "We'll cancel your recurring cleans and follow up.",
  },
  skip_next: {
    label: 'Skip next clean',
    description: 'We\'ll cancel your next scheduled clean only — your recurring schedule continues after that.',
    toast: 'Got it — we\'ll skip your next clean.',
  },
};

export default function RecurringScheduleControls({ token, propertyId }: RecurringScheduleControlsProps) {
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only render this section if the property has at least one active
  // recurring series. Saves screen real estate for one-off clients.
  const { data: series = [] } = useQuery({
    queryKey: ['portal-recurring-series', propertyId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('job_series')
        .select('id, frequency, interval_weeks, end_date')
        .eq('property_id', propertyId)
        .or(`end_date.is.null,end_date.gte.${today}`);
      return data || [];
    },
    enabled: !!propertyId,
  });

  if (!series.length) return null;

  const submit = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-schedule-change', {
        body: { token, property_id: propertyId, action, note: note.trim() || null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(ACTION_META[action].toast);
      setAction(null);
      setNote('');
    } catch (e: any) {
      toast.error(e.message || 'Could not send request.');
    } finally {
      setSubmitting(false);
    }
  };

  // Friendly cadence label.
  const frequency = series[0]?.frequency || 'weekly';
  const intervalWeeks = series[0]?.interval_weeks || 1;
  const cadenceLabel =
    frequency === 'weekly' && intervalWeeks === 1 ? 'Weekly' :
    frequency === 'weekly' && intervalWeeks === 2 ? 'Fortnightly' :
    frequency === 'monthly' ? 'Monthly' :
    `Every ${intervalWeeks} week${intervalWeeks === 1 ? '' : 's'}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Repeat className="w-4 h-4 text-primary" />
        {cadenceLabel} schedule active
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={() => setAction('skip_next')} className="gap-1.5">
          <FastForward className="w-4 h-4" /> Skip next
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAction('pause')} className="gap-1.5">
          <PauseCircle className="w-4 h-4" /> Pause schedule
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAction('cancel')} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
          <XCircle className="w-4 h-4" /> Cancel recurring
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Each request goes to the team — we'll confirm before changing anything.
      </p>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o && !submitting) { setAction(null); setNote(''); } }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{action && ACTION_META[action].label}</DialogTitle>
            <DialogDescription>
              {action && ACTION_META[action].description}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Anything we should know? (optional)"
            className="rounded-xl"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAction(null)} disabled={submitting}>Back</Button>
            <Button onClick={submit} disabled={submitting} className="gap-1">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
