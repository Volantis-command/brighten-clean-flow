import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, CalendarIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ScheduleApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    meta?: Record<string, any>;
  } | null;
}

const TIME_LABEL: Record<string, string> = {
  morning: 'Morning (7am–11am)',
  midday: 'Midday (11am–2pm)',
  afternoon: 'Afternoon (2pm–5pm)',
};

export function ScheduleApprovalModal({ open, onOpenChange, item }: ScheduleApprovalModalProps) {
  const meta = item?.meta;
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState('');
  const [cleanerId, setCleanerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (meta?.scheduledDate) {
      setSelectedDate(new Date(meta.scheduledDate + 'T00:00:00'));
    }
    if (meta?.scheduledTime) {
      setSelectedTime(meta.scheduledTime.slice(0, 5));
    } else if (meta?.timePreference) {
      const defaults: Record<string, string> = { morning: '08:00', midday: '11:30', afternoon: '14:00' };
      setSelectedTime(defaults[meta.timePreference] || '08:00');
    }
    setCleanerId('');
  }, [meta?.jobId]);

  const handleConfirm = async () => {
    if (!meta?.jobId || !selectedDate || !cleanerId) {
      toast.error('Please select a date and assign a cleaner.');
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // 1. Update job to scheduled
      const { error: jobErr } = await supabase
        .from('jobs')
        .update({
          status: 'scheduled',
          scheduled_date: dateStr,
          scheduled_time: selectedTime || null,
          cleaner_1_id: cleanerId,
        })
        .eq('id', meta.jobId);

      if (jobErr) throw jobErr;

      // 2. Update linked quote status
      if (meta.linkedQuoteId) {
        await supabase.from('quotes').update({ status: 'confirmed' }).eq('id', meta.linkedQuoteId);
      }

      // 3. Format date for SMS
      let formattedDate = dateStr;
      try {
        formattedDate = format(selectedDate, 'EEEE d MMMM');
      } catch { /* use raw */ }

      const timeWindow = selectedTime
        ? selectedTime
        : meta.timePreference
        ? TIME_LABEL[meta.timePreference] || meta.timePreference
        : '';

      // 4. Send client confirmation SMS via send-job-sms
      // First, find client phone from the property's client_properties
      const { data: cpData } = await supabase
        .from('client_properties')
        .select('client_id')
        .eq('property_id', (await supabase.from('jobs').select('property_id').eq('id', meta.jobId).single()).data?.property_id)
        .limit(1);

      if (cpData?.[0]?.client_id) {
        const { data: clientProfile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', cpData[0].client_id)
          .single();

        if (clientProfile?.phone) {
          const clientFirstName = (clientProfile.full_name || 'there').split(' ')[0];
          const clientSms = `Hi ${clientFirstName}, your clean is confirmed! 🧹✨\n\n📅 ${formattedDate} · ${timeWindow}\n📍 ${meta.propertyAddress || meta.propertyName || 'Your property'}\n\nWe'll see you then! — Brightly Cleaning`;
          
          await supabase.functions.invoke('send-job-sms', {
            body: { to: clientProfile.phone, message: clientSms },
          });
        }
      }

      // 5. Send cleaner SMS
      const { data: cleanerProfile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', cleanerId)
        .single();

      if (cleanerProfile?.phone) {
        const cleanerFirstName = (cleanerProfile.full_name || 'Team member').split(' ')[0];
        const clientFirstName = (meta.clientName || '').split(' ')[0] || 'Client';

        // Get clean type from linked quote
        let cleanType = 'Standard Clean';
        if (meta.linkedQuoteId) {
          const { data: quote } = await supabase.from('quotes').select('clean_type').eq('id', meta.linkedQuoteId).single();
          if (quote?.clean_type) cleanType = quote.clean_type;
        }

        const cleanerSms = `Hi ${cleanerFirstName}, you have a job confirmed 📋\n\n📅 ${formattedDate} · ${timeWindow}\n📍 ${meta.propertyAddress || meta.propertyName || 'Property'}\nClient: ${clientFirstName}\nClean type: ${cleanType}\n\nCheck the app for full details.`;

        await supabase.functions.invoke('send-job-sms', {
          body: { to: cleanerProfile.phone, message: cleanerSms },
        });

        // Create acceptance record
        await supabase.from('job_acceptances').upsert({
          job_id: meta.jobId,
          cleaner_id: cleanerId,
          acceptance_status: 'pending',
          sms_sent_at: new Date().toISOString(),
        }, { onConflict: 'job_id,cleaner_id' } as any);
      }

      // 6. Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['actions-awaiting-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });

      toast.success('Job confirmed and SMS notifications sent!');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Schedule approval error:', err);
      toast.error(err.message || 'Failed to confirm job');
    } finally {
      setSubmitting(false);
    }
  };

  if (!meta) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">Approve Booking</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Client & Property info */}
          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <p className="font-bold text-sm text-foreground">{meta.clientName || 'Client'}</p>
            <p className="text-xs text-muted-foreground">📍 {meta.propertyAddress || meta.propertyName || 'Property'}</p>
            {meta.timePreference && (
              <p className="text-xs text-muted-foreground">
                ⏰ Preferred: {TIME_LABEL[meta.timePreference] || meta.timePreference}
              </p>
            )}
            {meta.frequency && meta.frequency !== 'one_off' && (
              <p className="text-xs text-muted-foreground">
                🔄 Recurring: {meta.frequency.charAt(0).toUpperCase() + meta.frequency.slice(1)}
              </p>
            )}
          </div>

          {/* Date picker */}
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Confirm Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !selectedDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'EEEE, d MMMM yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time */}
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Time</Label>
            <Input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Cleaner dropdown */}
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Assign Cleaner</Label>
            <Select value={cleanerId} onValueChange={setCleanerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select cleaner..." />
              </SelectTrigger>
              <SelectContent>
                {cleaners.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name || c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!selectedDate || !cleanerId || submitting}
            className="w-full h-11 font-bold"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirm & Notify
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
