import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, CheckCircle2, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const TIME_WINDOWS = [
  { value: 'morning', label: '🌅 Morning (7am – 11am)' },
  { value: 'midday', label: '☀️ Midday (11am – 2pm)' },
  { value: 'afternoon', label: '🌇 Afternoon (2pm – 5pm)' },
];

const FREQUENCIES = [
  { value: 'one_off', label: 'One-off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead');
  const clientName = searchParams.get('name') || '';
  const serviceType = searchParams.get('service') || '';

  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('');
  const [frequency, setFrequency] = useState('one_off');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmedDate, setConfirmedDate] = useState('');
  const [error, setError] = useState('');

  const [qrData, setQrData] = useState<any>(null);
  const [manualFollowUp, setManualFollowUp] = useState(false);
  useEffect(() => {
    if (!leadId) return;
    supabase
      .from('quote_requests')
      .select('first_name, last_name, phone, address, clean_type')
      .eq('id', leadId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setQrData(data);
          const ct = (data.clean_type || '').toLowerCase();
          if (ct.includes('airbnb') || ct.includes('short-stay') || ct.includes('commercial')) {
            setManualFollowUp(true);
          }
        }
      });
  }, [leadId]);

  const displayName = clientName || [qrData?.first_name, qrData?.last_name].filter(Boolean).join(' ');
  const displayService = serviceType || qrData?.clean_type || '';

  const handleConfirmBooking = async () => {
    if (!date || !time) return;
    if (!leadId) {
      setError('Invalid booking link. Please contact Brightly Cleaning.');
      return;
    }
    await completeBooking();
  };

  const completeBooking = async () => {
    if (!date || !time || !leadId) return;
    setSubmitting(true);
    setError('');
    const formattedDate = format(date, 'yyyy-MM-dd');

    try {
      const updateData: any = {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        preferred_date: formattedDate,
        preferred_time: time,
        preferred_frequency: frequency,
      };

      const { error: qrError } = await supabase
        .from('quote_requests')
        .update(updateData)
        .eq('id', leadId);

      if (qrError) throw qrError;

      setConfirmedDate(format(date, 'EEEE d MMMM yyyy'));
      setSubmitted(true);
    } catch (e: any) {
      console.error('Booking submit error:', e);
      setError(e.message || 'Something went wrong. Please try again or call us on 0418 878 707.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const handleReschedule = async () => {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminder-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'reschedule_request',
            lead_id: leadId,
            client_name: displayName,
            address: qrData?.address || '',
            date: confirmedDate,
          }),
        });
        toast.success('Reschedule request sent. We\'ll call you back shortly.');
      } catch {
        toast.error('Could not send request. Please call us directly.');
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <div className="bg-card rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Booking confirmed!</h1>
          <p className="text-muted-foreground">
            We'll see you on <span className="font-bold text-foreground">{confirmedDate}</span>.
          </p>
          {frequency !== 'one_off' && (
            <p className="text-sm font-semibold text-primary">
              🔄 {FREQUENCIES.find(f => f.value === frequency)?.label} recurring clean set up
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Questions? Call us on <a href="tel:0418878707" className="font-semibold text-primary">0418 878 707</a>
          </p>
          <button
            onClick={handleReschedule}
            className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
          >
            Need to reschedule?
          </button>
        </div>
      </div>
    );
  }

  if (manualFollowUp) return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">Thanks for accepting your quote!</h1>
        <p className="text-muted-foreground">
          We'll be in touch shortly to confirm your first booking.
        </p>
        <p className="text-sm text-muted-foreground">
          Questions? Call us on <a href="tel:0418878707" className="font-semibold text-primary">0418 878 707</a>
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-primary tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
          <h2 className="text-xl font-bold text-foreground">Book Your Clean</h2>
          {displayName ? <p className="text-muted-foreground">Hi {displayName.split(' ')[0]}, choose your preferred clean date and time.</p> : null}
          {displayService ? (
            <p className="inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{displayService}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold">Preferred Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('h-12 w-full justify-start rounded-xl text-left font-normal', !date && 'text-muted-foreground')}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'EEEE, d MMMM yyyy') : 'Select a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className={cn('pointer-events-auto p-3')}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold">Preferred Time</Label>
          <Select value={time} onValueChange={setTime}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Choose a time window" />
            </SelectTrigger>
            <SelectContent>
              {TIME_WINDOWS.map((tw) => (
                <SelectItem key={tw.value} value={tw.value}>{tw.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold">Frequency</Label>
          <div className="flex gap-2 flex-wrap">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFrequency(f.value)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-bold border-2 transition-all',
                  frequency === f.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}

        <Button className="h-14 w-full rounded-xl text-lg font-bold" disabled={!date || !time || submitting} onClick={handleConfirmBooking}>
          {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          {submitting ? 'Submitting…' : 'Confirm Booking'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          No login required. We'll confirm your booking shortly.
        </p>
      </div>
    </div>
  );
}
