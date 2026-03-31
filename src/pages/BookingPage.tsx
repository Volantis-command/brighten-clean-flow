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
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!date || !time) return;
    if (!leadId) {
      setError('Invalid booking link. Please contact Brightly Cleaning.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          preferred_time: time,
          status: 'booking_requested',
          notes: `Preferred date: ${format(date, 'yyyy-MM-dd')}. Time: ${time}. Submitted via booking link.`,
        })
        .eq('id', leadId);

      if (updateError) throw updateError;
      setSubmitted(true);
    } catch (e: any) {
      console.error('Booking submit error:', e);
      setError('Something went wrong. Please try again or call us on 0418 878 707.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <div className="bg-card rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Booking Confirmed!</h1>
          <p className="text-muted-foreground">
            Thanks{clientName ? ` ${clientName.split(' ')[0]}` : ''}! We've received your preferred date and will confirm shortly.
          </p>
          <p className="text-sm text-muted-foreground">
            Questions? Call us on <a href="tel:0418878707" className="text-primary font-semibold">0418 878 707</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1
            className="text-3xl font-extrabold text-primary tracking-tight"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            Brightly<span className="text-accent">.</span>
          </h1>
          <h2 className="text-xl font-bold text-foreground">Book Your Clean</h2>
          {clientName && (
            <p className="text-muted-foreground">Hi {clientName.split(' ')[0]}, choose your preferred date & time</p>
          )}
          {serviceType && (
            <p className="text-sm font-semibold text-primary bg-primary/10 rounded-full px-3 py-1 inline-block">{serviceType}</p>
          )}
        </div>

        {/* Date picker */}
        <div className="space-y-2">
          <Label className="text-sm font-bold">Preferred Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full h-12 rounded-xl justify-start text-left font-normal',
                  !date && 'text-muted-foreground'
                )}
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
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Time window */}
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

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {/* Submit */}
        <Button
          className="w-full h-14 rounded-xl text-lg font-bold"
          disabled={!date || !time || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
          {submitting ? 'Submitting…' : 'Confirm Booking'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          We'll confirm your booking shortly. Call <a href="tel:0418878707" className="text-primary font-semibold">0418 878 707</a> for urgent requests.
        </p>
      </div>
    </div>
  );
}
