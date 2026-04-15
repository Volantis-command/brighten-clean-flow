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

export default function ClientRebookPage() {
  const { token } = useParams<{ token: string }>();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [timePreference, setTimePreference] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Look up client_properties by portal_token
  const { data: clientProp, isLoading } = useQuery({
    queryKey: ['rebook-token', token],
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
    queryKey: ['rebook-property', clientProp?.property_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('properties')
        .select('property_name, address, suburb, client_name, bedrooms, bathrooms, client_type')
        .eq('id', clientProp.property_id)
        .single();
      return data;
    },
    enabled: !!clientProp?.property_id,
  });

  const { data: profile } = useQuery({
    queryKey: ['rebook-profile', clientProp?.client_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', clientProp.client_id)
        .single();
      return data;
    },
    enabled: !!clientProp?.client_id,
  });

  // Get clean type from last completed job
  const { data: lastJob } = useQuery({
    queryKey: ['rebook-last-job', clientProp?.property_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, notes, linked_quote_id')
        .eq('property_id', clientProp.property_id)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false })
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

      // Create job via edge function (bypasses RLS)
      const { data: bookingResult, error: bookingError } = await supabase.functions.invoke(
        'create-booking-from-quote',
        {
          body: {
            property_id: clientProp.property_id,
            preferred_date: dateStr,
            preferred_time: timePreference,
            source: 'client_rebook',
            notes: `Rebook request. Client preferred time: ${timePreference}`,
          },
        }
      );
      if (bookingError) throw new Error('Failed to submit rebook request');

      // Notify admin
      const clientName = profile?.full_name || property?.client_name || 'Client';
      const propertyName = property?.property_name || 'Property';
      const propertyAddress = [property?.address, property?.suburb].filter(Boolean).join(', ');

      await (await import('@/lib/alerts')).createAlert({
        event_type: 'booking_confirmed',
        title: 'Rebook Request',
        body: `${clientName} wants to rebook a clean at ${propertyName}${propertyAddress ? ` (${propertyAddress})` : ''} for ${dateStr}.`,
        link: '/actions?filter=awaiting_quote',
      });

      setSubmitted(true);
    } catch (err: any) {
      console.error('Rebook submit error:', err);
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
          <h2 className="text-2xl font-extrabold text-foreground">Request received!</h2>
          <p className="text-muted-foreground">
            We'll send you a quote and confirm your booking shortly.
          </p>
          <p className="text-sm text-muted-foreground mt-6">Keep an eye on your SMS. ✨</p>
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
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Rebook</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">Book your next clean 🧹</h2>
          <p className="text-muted-foreground mt-1">Hi {firstName}, ready for another sparkle?</p>
        </div>

        {/* Property info */}
        {property && (
          <div className="bg-muted/50 rounded-xl p-4 space-y-1">
            <p className="font-bold text-sm text-foreground">{property.property_name}</p>
            <p className="text-xs text-muted-foreground">
              📍 {[property.address, property.suburb].filter(Boolean).join(', ')}
            </p>
            {(property.bedrooms || property.bathrooms) && (
              <p className="text-xs text-muted-foreground">
                🛏 {property.bedrooms || 0} bed · {property.bathrooms || 0} bath
              </p>
            )}
          </div>
        )}

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

        <Button
          onClick={handleSubmit}
          disabled={!selectedDate || !timePreference || submitting}
          className="w-full h-12 text-base font-bold rounded-xl"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Request Clean'}
        </Button>

        <p className="text-center text-muted-foreground text-xs">
          We'll send you a quote and confirm once reviewed.
        </p>
      </main>
    </div>
  );
}
