import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, CheckCircle2, Loader2, CreditCard } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { loadStripe } from '@stripe/stripe-js';

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
  const [depositAmount, setDepositAmount] = useState<number>(50);
  const [payingDeposit, setPayingDeposit] = useState(false);
  const [depositStep, setDepositStep] = useState(false);

  const [qrData, setQrData] = useState<any>(null);
  useEffect(() => {
    if (!leadId) return;
    supabase
      .from('quote_requests')
      .select('first_name, last_name, phone, address, clean_type, deposit_amount')
      .eq('id', leadId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setQrData(data);
          if (data.deposit_amount) setDepositAmount(Number(data.deposit_amount));
        }
      });
  }, [leadId]);

  // Fetch deposit amount from app_settings
  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'deposit_amount')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setDepositAmount(Number(data.value));
      });
  }, []);

  const displayName = clientName || [qrData?.first_name, qrData?.last_name].filter(Boolean).join(' ');
  const displayService = serviceType || qrData?.clean_type || '';

  const handleConfirmAndPay = async () => {
    if (!date || !time) return;
    if (!leadId) {
      setError('Invalid booking link. Please contact Brightly Cleaning.');
      return;
    }
    setDepositStep(true);
  };

  const handlePayDeposit = async () => {
    if (!leadId) return;
    setPayingDeposit(true);
    setError('');

    try {
      // Create Stripe checkout session via edge function
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-deposit-intent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: leadId,
            deposit_amount: depositAmount,
            success_url: `${window.location.origin}/book?lead=${leadId}&deposit_success=true&date=${format(date!, 'yyyy-MM-dd')}&time=${time}&frequency=${frequency}`,
            cancel_url: window.location.href,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data.client_secret) {
        // Fallback: complete booking without redirect
        await completeBooking(data.payment_intent_id);
      }
    } catch (e: any) {
      console.error('Payment error:', e);
      setError(e.message || 'Payment failed. Please try again.');
    } finally {
      setPayingDeposit(false);
    }
  };

  const handleSkipDeposit = async () => {
    await completeBooking();
  };

  const completeBooking = async (paymentIntentId?: string) => {
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

      if (paymentIntentId) {
        updateData.deposit_paid = true;
        updateData.deposit_paid_at = new Date().toISOString();
        updateData.stripe_payment_intent_id = paymentIntentId;
        updateData.deposit_amount = depositAmount;
      }

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

  // Handle return from Stripe checkout
  useEffect(() => {
    const depositSuccess = searchParams.get('deposit_success');
    const savedDate = searchParams.get('date');
    const savedTime = searchParams.get('time');
    const savedFreq = searchParams.get('frequency');

    if (depositSuccess === 'true' && savedDate && savedTime && leadId) {
      setDate(new Date(savedDate + 'T00:00:00'));
      setTime(savedTime);
      if (savedFreq) setFrequency(savedFreq);
      // Auto-complete booking
      const doComplete = async () => {
        setSubmitting(true);
        try {
          const { error: qrError } = await supabase
            .from('quote_requests')
            .update({
              status: 'accepted',
              accepted_at: new Date().toISOString(),
              preferred_date: savedDate,
              preferred_time: savedTime,
              preferred_frequency: savedFreq || 'one_off',
              deposit_paid: true,
              deposit_paid_at: new Date().toISOString(),
              deposit_amount: depositAmount,
            })
            .eq('id', leadId);
          if (qrError) throw qrError;
          setConfirmedDate(format(new Date(savedDate + 'T00:00:00'), 'EEEE d MMMM yyyy'));
          setSubmitted(true);
        } catch (e: any) {
          setError(e.message);
        } finally {
          setSubmitting(false);
        }
      };
      doComplete();
    }
  }, []);

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
          {frequency !== 'one_off' && (
            <p className="text-sm font-semibold text-primary">
              🔄 {FREQUENCIES.find(f => f.value === frequency)?.label} recurring clean set up
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Questions? Call us on <a href="tel:0418878707" className="font-semibold text-primary">0418 878 707</a>
          </p>
        </div>
      </div>
    );
  }

  // Deposit payment step
  if (depositStep) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <div className="bg-card rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold text-primary tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Brightly<span className="text-accent">.</span>
            </h1>
            <h2 className="text-xl font-bold text-foreground">Secure Your Booking</h2>
            <p className="text-muted-foreground">A ${depositAmount.toFixed(2)} deposit is required to confirm your clean.</p>
          </div>

          <div className="bg-muted rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Date</span>
              <span className="font-semibold text-foreground">{date ? format(date, 'EEEE, d MMMM yyyy') : ''}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Time</span>
              <span className="font-semibold text-foreground">{TIME_WINDOWS.find(t => t.value === time)?.label || time}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Deposit</span>
              <span className="font-bold text-primary">${depositAmount.toFixed(2)}</span>
            </div>
          </div>

          {error && <p className="text-center text-sm text-destructive">{error}</p>}

          <Button
            className="h-14 w-full rounded-xl text-lg font-bold gap-2"
            disabled={payingDeposit}
            onClick={handlePayDeposit}
          >
            {payingDeposit ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
            {payingDeposit ? 'Processing…' : `Pay $${depositAmount.toFixed(2)} Deposit`}
          </Button>

          <Button
            variant="ghost"
            className="w-full text-sm text-muted-foreground"
            onClick={() => setDepositStep(false)}
          >
            ← Back to date selection
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Deposit is deducted from your final bill. Secure payment via Stripe.
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

        {depositAmount > 0 && (
          <div className="bg-muted/50 rounded-xl p-3 text-center">
            <p className="text-sm text-muted-foreground">
              <CreditCard className="inline h-4 w-4 mr-1" />
              A <span className="font-bold text-foreground">${depositAmount.toFixed(2)}</span> deposit secures your booking
            </p>
          </div>
        )}

        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}

        <Button className="h-14 w-full rounded-xl text-lg font-bold" disabled={!date || !time || submitting} onClick={handleConfirmAndPay}>
          {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          {submitting ? 'Submitting…' : depositAmount > 0 ? 'Continue to Payment' : 'Confirm Booking'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          No login required. We'll confirm your booking shortly.
        </p>
      </div>
    </div>
  );
}
