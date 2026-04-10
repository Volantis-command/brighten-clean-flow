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
import { CalendarIcon, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
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

  // Check for client context: either a lead ID from SMS or a stored client session
  const storedClientId = localStorage.getItem('brightly_client_id');
  const hasClientContext = !!(leadId || storedClientId);

  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('');
  const [frequency, setFrequency] = useState('one_off');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmedDate, setConfirmedDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const [qrData, setQrData] = useState<any>(null);
  useEffect(() => {
    if (!leadId) return;
    supabase
      .from('quote_requests')
      .select('first_name, last_name, phone, address, clean_type, preferred_date, preferred_time')
      .eq('id', leadId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setQrData(data);
          if (data.preferred_date) {
            const parsed = new Date(data.preferred_date + 'T00:00:00');
            if (!isNaN(parsed.getTime())) setDate(parsed);
          }
          if ((data as any).preferred_time) {
            const timemap: Record<string, string> = {
              'Morning (7am-12pm)': 'morning',
              'Morning': 'morning',
              'Afternoon (12pm-5pm)': 'afternoon',
              'Afternoon': 'afternoon',
              'Either': 'morning',
            };
            setTime(timemap[(data as any).preferred_time] || 'morning');
          } else {
            setTime('morning');
          }
        }
      });
  }, [leadId]);

  // If no client context, show gated message
  if (!hasClientContext) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <div className="bg-card rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-extrabold text-foreground">Access Required</h1>
          <p className="text-muted-foreground text-sm">
            This page is only accessible from your client portal. Need help? Call{' '}
            <a href="tel:0418878707" className="font-semibold text-primary">0418 878 707</a>
          </p>
        </div>
      </div>
    );
  }

  const displayName = clientName || [qrData?.first_name, qrData?.last_name].filter(Boolean).join(' ');
  const displayService = serviceType || qrData?.clean_type || '';

  const handleConfirmBooking = async () => {
    if (!date || !time) return;
    if (!leadId) {
      // Client portal session booking — create a booking suggestion
      if (!storedClientId) {
        setError('Invalid booking session. Please contact Brightly Cleaning.');
        return;
      }
      await completePortalBooking();
      return;
    }
    await completeBooking();
  };

  const completePortalBooking = async () => {
    if (!date || !time || !storedClientId) return;
    setSubmitting(true);
    setError('');
    const formattedDate = format(date, 'yyyy-MM-dd');

    try {
      const { error: insertError } = await supabase.from('booking_suggestions').insert({
        source: 'client_portal',
        status: 'pending',
        suggested_clean_date: formattedDate,
        suggested_clean_time: time === 'morning' ? '09:00' : time === 'midday' ? '12:00' : '14:00',
      } as any);

      if (insertError) throw insertError;

      setConfirmedDate(format(date, 'EEEE d MMMM yyyy'));
      setSubmitted(true);
    } catch (e: any) {
      console.error('Booking submit error:', e);
      setError(e.message || 'Something went wrong. Please try again or call us on 0418 878 707.');
    } finally {
      setSubmitting(false);
    }
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
    const isPortalBooking = !leadId;

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
          <h1 className="text-2xl font-extrabold text-foreground">
            {isPortalBooking ? 'Booking request sent!' : 'Booking confirmed!'}
          </h1>
          <p className="text-muted-foreground">
            {isPortalBooking
              ? <>We'll confirm your booking for <span className="font-bold text-foreground">{confirmedDate}</span> shortly via SMS.</>
              : <>We'll see you on <span className="font-bold text-foreground">{confirmedDate}</span>.</>
            }
          </p>
          {frequency !== 'one_off' && (
            <p className="text-sm font-semibold text-primary">
              🔄 {FREQUENCIES.find(f => f.value === frequency)?.label} recurring clean set up
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Questions? Call us on <a href="tel:0418878707" className="font-semibold text-primary">0418 878 707</a>
          </p>
          {!isPortalBooking && (
            <button
              onClick={handleReschedule}
              className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
            >
              Need to reschedule?
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-primary tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
          <h2 className="text-xl font-bold text-foreground">Book Your Clean</h2>
          {displayName ? <p className="text-muted-foreground">Hi {displayName.split(' ')[0]}, confirm your booking details below.</p> : null}
          {qrData?.preferred_date && (
            <p className="text-xs text-muted-foreground">We've pre-filled your preferred date from your quote request.</p>
          )}
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
      </div>
    </div>
  );
}
