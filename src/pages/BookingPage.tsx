import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead');
  const clientName = searchParams.get('name') || '';
  const serviceType = searchParams.get('service') || '';

  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmedDate, setConfirmedDate] = useState('');
  const [error, setError] = useState('');

  // Fetch quote_request details for context if name/service not in URL
  const [qrData, setQrData] = useState<any>(null);
  useEffect(() => {
    if (!leadId) return;
    supabase
      .from('quote_requests')
      .select('first_name, last_name, phone, address, clean_type')
      .eq('id', leadId)
      .maybeSingle()
      .then(({ data }) => { if (data) setQrData(data); });
  }, [leadId]);

  const displayName = clientName || [qrData?.first_name, qrData?.last_name].filter(Boolean).join(' ');
  const displayService = serviceType || qrData?.clean_type || '';

  const handleSubmit = async () => {
    if (!date || !time) return;
    if (!leadId) {
      setError('Invalid booking link. Please contact Brightly Cleaning.');
      return;
    }

    setSubmitting(true);
    setError('');
    const formattedDate = format(date, 'yyyy-MM-dd');

    try {
      // 1. Update quote_requests status to accepted
      const { error: qrError } = await supabase
        .from('quote_requests')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          preferred_date: formattedDate,
          preferred_time: time,
        })
        .eq('id', leadId);

      if (qrError) throw qrError;

      // Notification will be picked up by admin via Actions inbox (quote_requests status = 'accepted')

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
          <p className="text-sm text-muted-foreground">
            Questions? Call us on <a href="tel:0418878707" className="font-semibold text-primary">0418 878 707</a>
          </p>
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

        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}

        <Button className="h-14 w-full rounded-xl text-lg font-bold" disabled={!date || !time || submitting} onClick={handleSubmit}>
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
