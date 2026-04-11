import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays } from 'date-fns';
import { Loader2, CalendarIcon, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TIME_PREFERENCES = [
  { value: 'morning', label: 'Morning', desc: '7am – 11am' },
  { value: 'midday', label: 'Midday', desc: '11am – 2pm' },
  { value: 'afternoon', label: 'Afternoon', desc: '2pm – 5pm' },
];

const FREQUENCY_OPTIONS = [
  { value: 'one_off', label: 'One-off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function ClientSchedulePage() {
  const { token } = useParams<{ token: string }>();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [timePreference, setTimePreference] = useState('');
  const [frequency, setFrequency] = useState('one_off');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Look up client_properties by portal_token
  const { data: clientProp, isLoading } = useQuery({
    queryKey: ['schedule-token', token],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_properties' as any)
        .select('id, client_id, property_id, portal_token')
        .eq('portal_token', token!)
        .eq('portal_active', true)
        .limit(1);
      return (data as any[])?.[0] || null;
    },
    enabled: !!token,
  });

  const { data: property } = useQuery({
    queryKey: ['schedule-property', clientProp?.property_id],
    queryFn: async () => {
      const { data } = await supabase.from('properties').select('property_name, address, suburb').eq('id', clientProp.property_id).single();
      return data;
    },
    enabled: !!clientProp?.property_id,
  });

  const { data: profile } = useQuery({
    queryKey: ['schedule-profile', clientProp?.client_id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', clientProp.client_id).single();
      return data;
    },
    enabled: !!clientProp?.client_id,
  });

  // Find accepted quote for this property
  const { data: acceptedQuote } = useQuery({
    queryKey: ['schedule-quote', clientProp?.property_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quotes')
        .select('id, clean_type, sell_price_inc_gst, bedrooms, bathrooms')
        .eq('property_id', clientProp.property_id)
        .eq('status', 'client_accepted')
        .order('quote_accepted_at', { ascending: false })
        .limit(1);
      return (data as any[])?.[0] || null;
    },
    enabled: !!clientProp?.property_id,
  });

  const handleSubmit = async () => {
    if (!selectedDate || !timePreference || !clientProp) return;
    setSubmitting(true);

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      // Create job with awaiting_schedule_approval status
      const { data: insertedJob, error: jobError } = await supabase.from('jobs').insert({
        property_id: clientProp.property_id,
        scheduled_date: dateStr,
        status: 'pending_approval',
        notes: `Client preferred time: ${timePreference}, Frequency: ${frequency}`,
        linked_quote_id: acceptedQuote?.id || null,
        price_inc_gst: acceptedQuote?.sell_price_inc_gst || null,
        source: 'client_portal',
        frequency: frequency === 'one_off' ? 'one-off' : frequency,
      } as any).select('id').single();

      if (jobError) throw jobError;

      // Auto-generate recurring jobs if frequency is not one-off
      if (insertedJob?.id && frequency !== 'one_off') {
        try {
          const { createRecurringJobSeries } = await import('@/lib/recurringJobHelper');
          const freq = frequency as any; // weekly, fortnightly, monthly
          await createRecurringJobSeries({
            parentJobId: insertedJob.id,
            frequency: freq,
            startDate: dateStr,
            propertyId: clientProp.property_id,
            priceIncGst: acceptedQuote?.sell_price_inc_gst || null,
            notes: `Client preferred time: ${timePreference}, Frequency: ${frequency}`,
            source: 'client_portal',
          });
        } catch { /* non-blocking */ }
      }

      // Update quote status
      if (acceptedQuote?.id) {
        await supabase.from('quotes').update({ status: 'awaiting_schedule_approval' }).eq('id', acceptedQuote.id);
      }

      // Create admin notification
      const clientName = profile?.full_name || 'Client';

      await (await import('@/lib/alerts')).createAlert({
        event_type: 'booking_confirmed',
        title: 'Client Selected Date',
        body: `${clientName} selected ${dateStr} (${timePreference}) for ${property?.property_name || 'property'}. Confirm and assign cleaner.`,
        link: '/actions?filter=awaiting_schedule',
      });

      setSubmitted(true);
    } catch (err: any) {
      console.error('Schedule submit error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFDFC] flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientProp) {
    return (
      <div className="min-h-screen bg-[#FDFDFC] flex flex-col items-center justify-center px-4">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-lg font-bold text-foreground">Invalid or inactive link</p>
        <p className="text-sm text-muted-foreground mt-1">Contact Brightly for a new link.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FDFDFC]">
        <header className="bg-white border-b border-border/50 sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-3">
            <h1 className="text-2xl font-extrabold text-primary" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Brightly<span className="text-accent">.</span>
            </h1>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
          <h2 className="text-2xl font-extrabold text-foreground">You're all set!</h2>
          <p className="text-muted-foreground">
            We've received your preferred date and time. Our team will confirm your booking shortly and assign your cleaner.
          </p>
          <p className="text-sm text-muted-foreground mt-6">You'll receive an SMS once confirmed. ✨</p>
        </main>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-screen bg-[#FDFDFC]">
      <header className="bg-white border-b border-border/50 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-primary" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Book</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">Hi {firstName} 👋</h2>
          <p className="text-muted-foreground mt-1">Select your preferred date and time for your clean.</p>
          {property && (
            <p className="text-sm text-muted-foreground mt-1">
              📍 {[property.property_name, property.address, property.suburb].filter(Boolean).join(', ')}
            </p>
          )}
        </div>

        {/* Date picker */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-foreground">Preferred Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !selectedDate && 'text-muted-foreground'
                )}
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
                disabled={(date) => date < addDays(new Date(), -1)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Time preference */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-foreground">Time Preference</label>
          <div className="grid grid-cols-3 gap-2">
            {TIME_PREFERENCES.map((tp) => (
              <button
                key={tp.value}
                onClick={() => setTimePreference(tp.value)}
                className={cn(
                  'rounded-xl border-2 p-3 text-center transition-all',
                  timePreference === tp.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                )}
              >
                <p className="font-bold text-sm">{tp.label}</p>
                <p className="text-xs text-muted-foreground">{tp.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-foreground">How often?</label>
          <div className="grid grid-cols-2 gap-2">
            {FREQUENCY_OPTIONS.map((fo) => (
              <button
                key={fo.value}
                onClick={() => setFrequency(fo.value)}
                className={cn(
                  'rounded-xl border-2 p-3 text-center transition-all',
                  frequency === fo.value
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-white text-foreground hover:border-primary/50'
                )}
              >
                {fo.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!selectedDate || !timePreference || submitting}
          className="w-full h-12 text-base font-bold rounded-xl"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Request'}
        </Button>

        <p className="text-center text-muted-foreground text-xs">
          Your booking will be confirmed once our team reviews your request.
        </p>
      </main>
    </div>
  );
}
