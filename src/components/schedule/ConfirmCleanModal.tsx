import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, CalendarIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ConfirmCleanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: { meta?: Record<string, any> } | null;
}

const TIME_LABEL: Record<string, string> = {
  morning: 'Morning (7am–11am)',
  midday: 'Midday (11am–2pm)',
  afternoon: 'Afternoon (2pm–5pm)',
};

const TIME_SLOTS = [
  { label: '7:00 AM', value: '07:00' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '10:00 AM', value: '10:00' },
  { label: '11:00 AM', value: '11:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '1:00 PM', value: '13:00' },
  { label: '2:00 PM', value: '14:00' },
  { label: '3:00 PM', value: '15:00' },
  { label: '4:00 PM', value: '16:00' },
  { label: '5:00 PM', value: '17:00' },
  { label: '6:00 PM', value: '18:00' },
];

const PREFERRED_TIME_DEFAULTS: Record<string, string> = {
  morning: '08:00',
  midday: '12:00',
  afternoon: '14:00',
};

export function ConfirmCleanModal({ open, onOpenChange, item }: ConfirmCleanModalProps) {
  const meta = item?.meta;
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState('');
  const [cleanerId, setCleanerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (meta?.preferredDate) {
      setSelectedDate(new Date(meta.preferredDate + 'T00:00:00'));
    }
    setSelectedTime(
      meta?.preferredTime
        ? PREFERRED_TIME_DEFAULTS[meta.preferredTime] || meta.preferredTime
        : '14:00'
    );
    setCleanerId('');
  }, [meta?.quoteRequestId]);

  const handleConfirm = async () => {
    if (!meta?.quoteRequestId || !selectedDate || !cleanerId) {
      toast.error('Please select a date and assign a cleaner.');
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const timeStr = selectedTime || '08:00';

      // 1. Update quote_requests status to 'confirmed'
      const { error: qrErr } = await supabase
        .from('quote_requests')
        .update({ status: 'confirmed' })
        .eq('id', meta.quoteRequestId);
      if (qrErr) throw qrErr;

      // 2. Create a property record (or find existing)
      let propertyId: string | null = null;
      if (meta.address) {
        const { data: existingProp } = await supabase
          .from('properties')
          .select('id')
          .eq('address', meta.address)
          .limit(1)
          .maybeSingle();

        if (existingProp) {
          propertyId = existingProp.id;
        } else {
          const { data: newProp } = await supabase
            .from('properties')
            .insert({
              property_name: meta.address,
              address: meta.address,
              bedrooms: meta.bedrooms || 1,
              bathrooms: meta.bathrooms || 1,
              client_name: meta.clientName || null,
              client_phone: meta.clientPhone || null,
              client_type: 'residential',
            })
            .select('id')
            .single();
          if (newProp) propertyId = newProp.id;
        }
      }

      // 3. Create job record
      const priceIncGst = meta.totalIncGst ? Number(meta.totalIncGst) : null;
      const priceExGst = priceIncGst ? priceIncGst / 1.1 : null;

      const { error: jobErr } = await supabase.from('jobs').insert({
        property_id: propertyId,
        scheduled_date: dateStr,
        scheduled_time: timeStr,
        cleaner_1_id: cleanerId,
        status: 'scheduled',
        notes: `Client: ${meta.clientName || 'N/A'}\nService: ${meta.cleanType || 'Standard Clean'}\nPhone: ${meta.clientPhone || 'N/A'}`,
        price_inc_gst: priceIncGst,
        price_ex_gst: priceExGst,
        source: 'quote_request',
      });
      if (jobErr) throw jobErr;

      // 4. Send SMS to assigned cleaner
      const { data: cleanerProfile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', cleanerId)
        .single();

      let formattedDate = dateStr;
      try { formattedDate = format(selectedDate, 'EEEE d MMMM'); } catch { /* use raw */ }

      const timeWindow = meta.preferredTime ? TIME_LABEL[meta.preferredTime] || selectedTime : selectedTime;

      if (cleanerProfile?.phone) {
        const cleanerFirstName = (cleanerProfile.full_name || 'Team member').split(' ')[0];
        const cleanerSms = `Hi ${cleanerFirstName}, you have a new job 📋\n\n🧹 ${meta.cleanType || 'Standard Clean'}\n📍 ${meta.address || 'Property'}\n📅 ${formattedDate} · ${timeWindow}\nClient: ${(meta.clientName || 'Client').split(' ')[0]}\n\nCheck the app for full details. — Brightly`;

        await supabase.functions.invoke('send-job-sms', {
          body: { to: cleanerProfile.phone, message: cleanerSms },
        });
      }

      // 5. Send confirmation SMS to client
      if (meta.clientPhone) {
        const clientFirstName = (meta.clientName || 'there').split(' ')[0];
        const clientSms = `Hi ${clientFirstName}, your clean is confirmed! 🧹✨\n\n📅 ${formattedDate} · ${timeWindow}\n📍 ${meta.address || 'Your property'}\n\nWe'll see you then! — Brightly Cleaning`;

        const formatAuPhone = (phone: string) => {
          const cleaned = phone.replace(/[\s\-()]/g, '');
          if (cleaned.startsWith('+61')) return cleaned;
          if (cleaned.startsWith('61') && cleaned.length >= 11) return '+' + cleaned;
          if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);
          return '+61' + cleaned;
        };

        await supabase.functions.invoke('send-job-sms', {
          body: { to: formatAuPhone(meta.clientPhone), message: clientSms },
        });
      }

      // 6. Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['actions-confirm-clean-date'] });
      queryClient.invalidateQueries({ queryKey: ['actions-awaiting-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });

      toast.success('Job confirmed, cleaner notified via SMS!');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Confirm clean error:', err);
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
          <DialogTitle className="text-lg font-extrabold">Confirm & Assign Cleaner</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Client & Property info */}
          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <p className="font-bold text-sm text-foreground">{meta.clientName || 'Client'}</p>
            <p className="text-xs text-muted-foreground">📍 {meta.address || 'No address'}</p>
            <p className="text-xs text-muted-foreground">🧹 {meta.cleanType || 'Clean'}</p>
            {meta.preferredTime && (
              <p className="text-xs text-muted-foreground">
                ⏰ Preferred: {TIME_LABEL[meta.preferredTime] || meta.preferredTime}
              </p>
            )}
            {meta.totalIncGst && (
              <p className="text-xs text-muted-foreground">
                💰 Quoted: ${Number(meta.totalIncGst).toFixed(2)}
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

          {/* Time slots */}
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Time</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot.value}
                  type="button"
                  onClick={() => setSelectedTime(slot.value)}
                  className={cn(
                    'rounded-full px-2 py-1.5 text-xs font-semibold transition-colors border',
                    selectedTime === slot.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-foreground border-border hover:bg-muted'
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
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
            Confirm & Assign Cleaner
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
