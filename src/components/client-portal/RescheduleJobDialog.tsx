import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  propertyId: string;
  propertyName: string;
  job: {
    id: string;
    scheduled_date: string;
    scheduled_time: string | null;
  } | null;
}

const TIME_WINDOWS = [
  { value: 'morning', label: 'Morning', desc: '7am – 11am' },
  { value: 'midday', label: 'Midday', desc: '11am – 2pm' },
  { value: 'afternoon', label: 'Afternoon', desc: '2pm – 5pm' },
];

export default function RescheduleJobDialog({
  open, onOpenChange, token, propertyId, propertyName, job,
}: Props) {
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [newTime, setNewTime] = useState<string>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && job?.scheduled_date) {
      // Pre-fill with the existing date so users see what they're moving from.
      setNewDate(new Date(job.scheduled_date + 'T00:00:00'));
    }
    if (!open) {
      setNewDate(undefined);
      setNewTime('');
      setNote('');
    }
  }, [open, job?.scheduled_date]);

  if (!job) return null;

  const submit = async () => {
    if (!newDate) {
      toast.error('Pick a new date');
      return;
    }
    setSubmitting(true);
    try {
      const dateStr = format(newDate, 'yyyy-MM-dd');
      const { data, error } = await supabase.functions.invoke('request-schedule-change', {
        body: {
          token,
          property_id: propertyId,
          action: 'reschedule',
          job_id: job.id,
          new_date: dateStr,
          new_time: newTime || null,
          note: note.trim() || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Sent — we'll confirm the new time shortly.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Could not send request.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentLabel = `${format(new Date(job.scheduled_date + 'T00:00:00'), 'EEE, d MMM')}` +
    (job.scheduled_time ? ` at ${job.scheduled_time.slice(0, 5)}` : '');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="rounded-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Repeat className="w-5 h-5" /> Reschedule clean
          </DialogTitle>
          <DialogDescription>
            Currently <span className="font-semibold text-foreground">{currentLabel}</span> at {propertyName}. We'll confirm the new time after the team reviews.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">New date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full h-12 justify-start text-left font-normal rounded-xl bg-card',
                    !newDate && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newDate ? format(newDate, 'EEEE, d MMMM yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newDate}
                  onSelect={setNewDate}
                  disabled={(d) => d < addDays(new Date(), -1)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Time window (optional)</label>
            <div className="grid grid-cols-3 gap-2">
              {TIME_WINDOWS.map((tw) => (
                <button
                  key={tw.value}
                  type="button"
                  onClick={() => setNewTime(newTime === tw.value ? '' : tw.value)}
                  className={cn(
                    'rounded-xl border-2 p-2 text-center transition-all',
                    newTime === tw.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:border-primary/50',
                  )}
                >
                  <p className="font-bold text-xs">{tw.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{tw.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Note (optional)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything we should know?"
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !newDate} className="gap-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
            Request reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
